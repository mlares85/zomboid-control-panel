import express from "express";
import { createLogger } from "../utils/logger.js";
import { sanitizeError } from "../utils/sanitize.js";
import { getServer, getServers, createServer, deleteServer } from "../database/init.js";
import { createDockerVolumeManager } from "../services/dockerVolumeManager.js";
import { createDockerContainerFactory } from "../services/dockerContainerFactory.js";
import { PROVIDERS } from "../utils/serverProvider.js";

const log = createLogger("API:Docker");
const router = express.Router();

function getDockerClient(req) {
  return req.app.get("dockerClient");
}

function summarizeContainer(container) {
  return {
    id: container.Id,
    name: (container.Names || [])[0]?.replace(/^\//, "") || container.Id,
    image: container.Image,
    state: container.State,
    status: container.Status,
    labels: container.Labels || {},
  };
}

// { available: bool, containers: [] } — cheap check for gating Docker UI.
router.get("/status", async (req, res) => {
  try {
    const dockerClient = getDockerClient(req);
    if (!dockerClient?.available) {
      return res.json({ available: false, containers: [] });
    }
    const containers = await dockerClient.findPZContainers();
    res.json({ available: true, containers: containers.map(summarizeContainer) });
  } catch (error) {
    log.error(`Failed to get Docker status: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// List PZ-related containers with status.
router.get("/containers", async (req, res) => {
  try {
    const dockerClient = getDockerClient(req);
    if (!dockerClient?.available) {
      return res.json({ containers: [] });
    }
    const containers = await dockerClient.findPZContainers();
    res.json({ containers: containers.map(summarizeContainer) });
  } catch (error) {
    log.error(`Failed to list containers: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/containers/:id/start", async (req, res) => {
  await handleLifecycleAction(req, res, "startContainer");
});

router.post("/containers/:id/stop", async (req, res) => {
  await handleLifecycleAction(req, res, "stopContainer");
});

router.post("/containers/:id/restart", async (req, res) => {
  await handleLifecycleAction(req, res, "restartContainer");
});

async function handleLifecycleAction(req, res, method) {
  try {
    const dockerClient = getDockerClient(req);
    if (!dockerClient?.available) {
      return res.status(503).json({ error: "Docker socket unavailable" });
    }
    const result = await dockerClient[method](req.params.id);
    if (!result.success) {
      return res.status(502).json({ error: sanitizeError(result.error) });
    }
    log.info(`${method} succeeded for container ${req.params.id}`);
    res.json(result);
  } catch (error) {
    log.error(`${method} failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
}

router.get("/containers/:id/logs", async (req, res) => {
  try {
    const dockerClient = getDockerClient(req);
    if (!dockerClient?.available) {
      return res.status(503).json({ error: "Docker socket unavailable" });
    }
    const tail = parseInt(req.query.tail, 10) || 100;
    const result = await dockerClient.getContainerLogs(req.params.id, tail);
    if (!result.success) {
      return res.status(502).json({ error: sanitizeError(result.error) });
    }
    res.json(result);
  } catch (error) {
    log.error(`Failed to fetch container logs: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.get("/containers/:id/stats", async (req, res) => {
  try {
    const dockerClient = getDockerClient(req);
    if (!dockerClient?.available) {
      return res.status(503).json({ error: "Docker socket unavailable" });
    }
    const stats = await dockerClient.getContainerStats(req.params.id);
    if (!stats) {
      return res.status(502).json({ error: "Failed to fetch container stats" });
    }
    res.json(stats);
  } catch (error) {
    log.error(`Failed to fetch container stats: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Keyed by both container id and bare name so callers can look a container
// up by whatever ref their server profile stored (dockerContainerId vs
// dockerContainerName).
function keyStatsByIdAndName(container, stats, map) {
  map[container.Id] = stats;
  const name = (container.Names || [])[0]?.replace(/^\//, "");
  if (name) map[name] = stats;
}

// Snapshot for every running PZ container — powers the dashboard cards
// without one round trip per card.
router.get("/stats", async (req, res) => {
  try {
    const dockerClient = getDockerClient(req);
    if (!dockerClient?.available) {
      return res.json({});
    }
    const containers = await dockerClient.findPZContainers();
    const running = containers.filter((container) => container.State === "running");
    const results = await Promise.all(
      running.map(async (container) => [container, await dockerClient.getContainerStats(container.Id)]),
    );
    const map = {};
    for (const [container, stats] of results) {
      if (stats) keyStatsByIdAndName(container, stats, map);
    }
    res.json(map);
  } catch (error) {
    log.error(`Failed to fetch batch container stats: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// ── Docker-managed server CRUD ──

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

router.get("/managed/prerequisites", async (req, res) => {
  try {
    const dockerClient = getDockerClient(req);
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

router.get("/managed/available-ports", async (req, res) => {
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

router.post("/managed/servers", async (req, res) => {
  try {
    const validationError = validateManagedServerInput(req.body);
    if (validationError) return res.status(400).json({ success: false, error: validationError });

    const deps = getManagedDeps(req);
    if (!deps) return res.status(503).json({ success: false, error: "Docker unavailable" });

    const { serverName, gamePort, rconPort, rconPassword, minMemoryMb, maxMemoryMb, adminPassword } = req.body;
    const result = await deps.containerFactory.createManagedServer({
      serverName, gamePort, rconPort, rconPassword, minMemoryMb, maxMemoryMb,
    });
    if (!result.success) return res.status(502).json({ success: false, error: result.error });

    const server = await createServer({
      name: serverName,
      serverName,
      provider: PROVIDERS.DOCKER_MANAGED,
      dockerContainerId: result.containerId,
      dockerContainerName: result.containerName,
      installPath: "/opt/pz-server",
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

router.delete("/managed/servers/:id", async (req, res) => {
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
