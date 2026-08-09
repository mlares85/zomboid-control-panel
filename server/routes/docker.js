import express from "express";
import { createLogger } from "../utils/logger.js";
import { sanitizeError } from "../utils/sanitize.js";

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

export default router;
