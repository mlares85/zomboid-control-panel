import express from "express";
import { existsSync, readdirSync } from "fs";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { getServer, getServers, createServer, deleteServer } from "../../database/init.js";
import { createDockerVolumeManager } from "../../services/dockerVolumeManager.js";
import { createDockerContainerFactory } from "../../services/dockerContainerFactory.js";
import { PROVIDERS } from "../../utils/serverProvider.js";
import { startBaseVolumePopulation } from "../../services/baseVolumePopulator.js";

const log = createLogger("API:DockerManaged");
const router = express.Router();

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

function validateManagedServerInput(body) {
  if (!body.serverName || typeof body.serverName !== "string") return "serverName is required";
  if (body.gamePort !== undefined && typeof body.gamePort !== "number") return "gamePort must be a number";
  if (body.rconPort !== undefined && typeof body.rconPort !== "number") return "rconPort must be a number";
  if (!body.rconPassword || body.rconPassword.length < 6) return "rconPassword must be at least 6 characters";
  return null;
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

router.post("/populate-base", async (req, res) => {
  if (populatingBase) {
    return res.status(409).json({ success: false, error: "Base volume population already in progress" });
  }
  try {
    const dockerClient = getDockerClient(req);
    if (!dockerClient?.available) {
      return res.status(503).json({ success: false, error: "Docker unavailable" });
    }
    const io = req.app.get("io");
    populatingBase = true;
    const result = await startBaseVolumePopulation(dockerClient, io, () => { populatingBase = false; });
    if (!result.success) {
      populatingBase = false;
      return res.status(502).json(result);
    }
    res.json(result);
  } catch (error) {
    populatingBase = false;
    log.error(`Failed to populate base volume: ${error.message}`);
    res.status(500).json({ success: false, error: sanitizeError(error.message) });
  }
});

// ── Server CRUD ──

router.post("/servers", async (req, res) => {
  try {
    const validationError = validateManagedServerInput(req.body);
    if (validationError) return res.status(400).json({ success: false, error: validationError });

    const deps = getManagedDeps(req);
    if (!deps) return res.status(503).json({ success: false, error: "Docker unavailable" });

    const { serverName, gamePort, rconPort, rconPassword, minMemoryMb, maxMemoryMb, adminPassword, basePath } = req.body;
    const result = await deps.containerFactory.createManagedServer({
      serverName, gamePort, rconPort, rconPassword, minMemoryMb, maxMemoryMb, basePath,
    });
    if (!result.success) return res.status(502).json({ success: false, error: result.error });

    const server = await createServer({
      name: serverName,
      serverName,
      provider: PROVIDERS.DOCKER_MANAGED,
      dockerContainerId: result.containerId,
      dockerContainerName: result.containerName,
      installPath: basePath || "/opt/pz-server",
      zomboidDataPath: "/opt/pz-data",
      rconHost: "127.0.0.1",
      rconPort,
      rconPassword,
      serverPort: gamePort,
      minMemory: minMemoryMb,
      maxMemory: maxMemoryMb,
      adminPassword,
    });

    await deps.dockerClient.startContainer(result.containerId);
    res.status(201).json({ success: true, server, containerId: result.containerId });
  } catch (error) {
    log.error(`Failed to create managed server: ${error.message}`);
    res.status(500).json({ success: false, error: sanitizeError(error.message) });
  }
});

router.delete("/servers/:id", async (req, res) => {
  try {
    const server = await getServer(req.params.id);
    if (!server) return res.status(404).json({ success: false, error: "Server not found" });

    const deps = getManagedDeps(req);
    if (!deps) return res.status(503).json({ success: false, error: "Docker unavailable" });

    const removeData = req.query.removeData === "true";
    const removeResult = await deps.containerFactory.removeManagedServer(server.dockerContainerId, removeData);
    if (!removeResult.success) return res.status(502).json({ success: false, error: removeResult.error });

    await deleteServer(req.params.id);
    res.json({ success: true });
  } catch (error) {
    log.error(`Failed to remove managed server: ${error.message}`);
    res.status(500).json({ success: false, error: sanitizeError(error.message) });
  }
});

export default router;
