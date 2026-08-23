import express from "express";
import { existsSync, readdirSync } from "fs";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError, sanitizeServerResponse } from "../../utils/sanitize.js";
import { getServer, getServers, createServer, deleteServer, setActiveServer } from "../../database/init.js";
import { createDockerVolumeManager } from "../../services/dockerVolumeManager.js";
import { createDockerContainerFactory } from "../../services/dockerContainerFactory.js";
import { PROVIDERS } from "../../utils/serverProvider.js";
import { ContainerSteamCmdInstaller } from "../../services/installer/ContainerSteamCmdInstaller.js";
import { installPanelBridgeMod } from "../server/installHelpers.js";
import { requireRole } from "../../services/auth.js";
import { registerManagedHealthRoutes } from "./managedHealth.js";
import { validateManagedServerInput, resolveHostPath } from "./managedValidation.js";

const log = createLogger("API:DockerManaged");
const router = express.Router();
registerManagedHealthRoutes(router);

/** Activate a server: set it as active, reload ServerManager + RCON config. */
async function activateServer(req, server) {
  await setActiveServer(server.id);
  const serverManager = req.app.get("serverManager");
  const rconService = req.app.get("rconService");
  const io = req.app.get("io");

  if (serverManager?.reloadConfig) await serverManager.reloadConfig();
  if (rconService) {
    try {
      await rconService.reloadConfig();
    } catch (e) {
      log.warn(`RCON config reload after activation failed: ${e.message}`);
    }
  }
  if (io) io.emit("activeServerChanged", { server });
  log.info(`Activated managed server: ${server.name}`);
}

function getDockerClient(req) {
  return req.app.get("dockerClient");
}

function getManagedDeps(req) {
  const dockerClient = getDockerClient(req);
  if (!dockerClient?.available) return null;
  const volumeManager = createDockerVolumeManager(dockerClient);
  const containerFactory = createDockerContainerFactory(dockerClient, volumeManager);
  return { dockerClient, containerFactory, volumeManager };
}

const PZ_SERVER_SIGNATURES = ["ProjectZomboid64", "start-server.sh", "StartServer64.bat"];

function looksLikePzServer(dirPath) {
  try {
    const entries = readdirSync(dirPath);
    return PZ_SERVER_SIGNATURES.some((sig) => entries.includes(sig));
  } catch {
    return false;
  }
}

// ── Prerequisites ──

router.get("/prerequisites", async (_req, res) => {
  try {
    const dockerClient = getDockerClient(_req);
    if (!dockerClient?.available) {
      return res.json({ dockerAvailable: false, baseVolume: { exists: false, populated: false } });
    }
    const volumeManager = createDockerVolumeManager(dockerClient);
    const baseVolume = await volumeManager.getBaseVolumeStatus();
    res.json({ dockerAvailable: true, baseVolume });
  } catch (error) {
    log.error(`Failed to check managed prerequisites: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Validate that a host path contains PZ server files (for bind-mount mode)
router.post("/validate-base-path", async (req, res) => {
  const { path: dirPath } = req.body;
  if (!dirPath || typeof dirPath !== "string") {
    return res.status(400).json({ valid: false, error: "path is required" });
  }
  if (!existsSync(dirPath)) {
    return res.json({ valid: false, error: "Path does not exist" });
  }
  const valid = looksLikePzServer(dirPath);
  res.json({ valid, error: valid ? null : "No PZ server files found at this path" });
});

// ── Port assignment ──

router.get("/available-ports", async (req, res) => {
  try {
    const deps = getManagedDeps(req);
    if (!deps) return res.status(503).json({ error: "Docker unavailable" });
    const servers = await getServers();
    const mapped = servers.map((s) => ({ gamePort: s.serverPort, rconPort: s.rconPort }));
    const ports = deps.containerFactory.findAvailablePorts(mapped);
    res.json(ports);
  } catch (error) {
    log.error(`Failed to find available ports: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// ── Populate base volume via temp SteamCMD container ──

let populatingBase = false;

router.post("/populate-base", requireRole("admin"), async (req, res) => {
  if (populatingBase) {
    return res.status(409).json({ success: false, error: "Base volume population already in progress" });
  }
  try {
    const dockerClient = getDockerClient(req);
    if (!dockerClient?.available) {
      return res.status(503).json({ success: false, error: "Docker unavailable" });
    }
    // Gap 8: check if a SteamCMD populate container is already running
    // (e.g. from a prior panel instance that restarted mid-download).
    const existing = await dockerClient.inspectContainer("zomboid-steamcmd-populate");
    if (existing?.State?.Running) {
      return res.status(409).json({ success: false, error: "SteamCMD download already running from a previous session" });
    }
    // Clean up a stopped populate container so the new one can use the name.
    if (existing) {
      await dockerClient.removeContainer("zomboid-steamcmd-populate", true);
    }
    const io = req.app.get("io");
    populatingBase = true;

    const installer = new ContainerSteamCmdInstaller({ dockerClient });
    const onProgress = (event, data) => {
      if (event === "log") io.emit("docker:populate-log", data);
      else if (event === "complete") {
        io.emit("docker:populate-complete", data);
        populatingBase = false;
      }
    };

    // Fire-and-forget — progress via Socket.IO
    installer.install({ volumeName: "zomboid-panel-base", onProgress })
      .catch((err) => {
        populatingBase = false;
        log.error(`Base volume population failed: ${err.message}`);
      });

    res.json({ success: true, message: "Base volume population started" });
  } catch (error) {
    populatingBase = false;
    log.error(`Failed to populate base volume: ${error.message}`);
    res.status(500).json({ success: false, error: sanitizeError(error.message) });
  }
});

// ── Server CRUD ──

router.post("/servers", requireRole("admin"), async (req, res) => {
  try {
    const validationError = validateManagedServerInput(req.body);
    if (validationError) return res.status(400).json({ success: false, error: validationError });

    const deps = getManagedDeps(req);
    if (!deps) return res.status(503).json({ success: false, error: "Docker unavailable" });

    const {
      serverName, gamePort, rconPort, rconPassword, minMemoryMb, maxMemoryMb,
      adminPassword, basePath, image, restartPolicy, dockerMemoryMb, cpuLimit, timezone,
    } = req.body;
    // Resolve container-internal paths to host paths for bind mounts
    const hostBasePath = basePath ? await resolveHostPath(basePath, deps.dockerClient) : undefined;
    const io = req.app.get("io");
    const emitProgress = (phase, message) => {
      if (io) io.emit("docker:create-progress", { phase, message });
    };

    emitProgress("creating-volumes", "Preparing storage volumes…");
    const result = await deps.containerFactory.createManagedServer({
      serverName, gamePort, rconPort, rconPassword, minMemoryMb, maxMemoryMb,
      basePath: hostBasePath, containerBasePath: basePath, image, adminPassword,
      restartPolicy, dockerMemoryMb, cpuLimit, timezone,
    }, emitProgress);
    if (!result.success) return res.status(502).json({ success: false, error: result.error });

    // Gap 2: use the container name as RCON host — Docker DNS resolves it
    // on the zomboid-panel-net bridge network. The panel container is
    // auto-connected to that network during createManagedServer.
    const server = await createServer({
      name: serverName,
      serverName,
      provider: PROVIDERS.DOCKER_MANAGED,
      dockerContainerId: result.containerId,
      dockerContainerName: result.containerName,
      installPath: basePath || "/opt/pz-server",
      // null — the data path is inside the managed container, not accessible
      // from the panel container's filesystem. Bridge/backups need Docker-aware
      // implementations for managed servers (future work).
      zomboidDataPath: null,
      rconHost: result.containerName,
      rconPort,
      rconPassword,
      serverPort: gamePort,
      minMemory: minMemoryMb,
      maxMemory: maxMemoryMb,
      adminPassword,
    });

    // Auto-install PanelBridge.lua so the server is ready for advanced features.
    const bridgePath = basePath || server.installPath;
    if (bridgePath) installPanelBridgeMod(bridgePath);

    // Gap 1: rollback on start failure — if startContainer fails, clean up
    // the container and DB record so nothing is orphaned.
    emitProgress("starting-server", "Starting container — first boot installs dependencies…");
    const startResult = await deps.dockerClient.startContainer(result.containerId);
    if (!startResult.success) {
      log.warn(`Container start failed, rolling back: ${startResult.error}`);
      await deps.dockerClient.removeContainer(result.containerId, true).catch(() => {});
      await deleteServer(server.id).catch(() => {});
      return res.status(502).json({ success: false, error: `Container created but failed to start: ${startResult.error}` });
    }

    // The entrypoint pre-seeds RCONPort + RCONPassword in a stub INI. PZ
    // inflates it into a full INI preserving those values. No post-boot
    // patching or restart needed.

    // Activate the newly created server so ServerManager and RCON service
    // pick up its config. Without this, the RCON service keeps whatever
    // stale password it loaded at startup and auth fails.
    emitProgress("activating", "Activating server…");
    await activateServer(req, server);

    emitProgress("done", "Server created successfully!");
    res.status(201).json({ success: true, server: sanitizeServerResponse(server), containerId: result.containerId });
  } catch (error) {
    log.error(`Failed to create managed server: ${error.message}`);
    res.status(500).json({ success: false, error: sanitizeError(error.message) });
  }
});

router.delete("/servers/:id", requireRole("admin"), async (req, res) => {
  try {
    const server = await getServer(req.params.id);
    if (!server) return res.status(404).json({ success: false, error: "Server not found" });

    const deps = getManagedDeps(req);
    if (!deps) return res.status(503).json({ success: false, error: "Docker unavailable" });

    const removeData = req.query.removeData === "true";
    const removeResult = await deps.containerFactory.removeManagedServer(
      server.dockerContainerId,
      { removeData, serverName: server.serverName },
    );
    if (!removeResult.success) return res.status(502).json({ success: false, error: removeResult.error });

    await deleteServer(req.params.id);
    res.json({ success: true });
  } catch (error) {
    log.error(`Failed to remove managed server: ${error.message}`);
    res.status(500).json({ success: false, error: sanitizeError(error.message) });
  }
});

// ── Delete the shared base volume (PZ server installation) ──

router.delete("/base-volume", requireRole("admin"), async (req, res) => {
  try {
    const deps = getManagedDeps(req);
    if (!deps) return res.status(503).json({ success: false, error: "Docker unavailable" });

    const result = await deps.volumeManager.removeBaseVolume();
    if (!result.success) return res.status(502).json({ success: false, error: result.error });

    log.info("Base volume deleted by user request");
    res.json({ success: true });
  } catch (error) {
    log.error(`Failed to delete base volume: ${error.message}`);
    res.status(500).json({ success: false, error: sanitizeError(error.message) });
  }
});

export default router;
