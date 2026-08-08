/**
 * Bridge path configuration: auto-configure (detect + install mod), a
 * read-only scan preview, manual auto-detect, and direct path configure.
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import bridge from "../../services/panelBridge.js";
import { getActiveServer, getServer } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { createLogger } from "../../utils/logger.js";
import {
  findAutoConfigurePath,
  scanServerPreviewPaths,
} from "../../services/panelBridgePathDiscovery.js";
import {
  installOrUpdateMod,
  modCandidateDirs,
} from "../../services/panelBridgeModSource.js";

const log = createLogger("API:PanelBridge");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

async function resolveTargetServer(serverId) {
  if (serverId) {
    const targetServer = await getServer(serverId);
    if (!targetServer) {
      return { error: `Server with ID ${serverId} not found.` };
    }
    return { targetServer };
  }
  const targetServer = await getActiveServer();
  if (!targetServer) {
    return {
      error: "No active server configured. Please configure a server first.",
    };
  }
  return { targetServer };
}

// Auto-configure bridge from server settings (optionally specify serverId)
router.post("/auto-configure", async (req, res) => {
  try {
    const { serverId } = req.body;
    log.info(`POST /auto-configure (serverId=${serverId || "active"})`);

    const { targetServer, error } = await resolveTargetServer(serverId);
    if (error) return res.status(400).json({ error });

    const serverName = targetServer.serverName || targetServer.name;
    if (!serverName) {
      return res.status(400).json({ error: "Server name not configured." });
    }

    const { foundPath, searchedLocations } = findAutoConfigurePath(
      targetServer,
      serverName,
    );
    if (!foundPath) {
      return res.status(400).json({
        error: `Could not determine bridge path for server "${serverName}". Make sure server installPath is set.`,
        searchedPaths: searchedLocations,
      });
    }

    // DON'T create the directory - the PZ mod will create it when it runs
    // Just configure the bridge to watch this path

    // Stop bridge first if already running so watcher/poller restarts on new path
    if (bridge.isRunning) {
      bridge.stop();
    }

    // Configure and start bridge - foundPath IS the complete panelbridge folder
    bridge.configure(foundPath.path, true); // true = direct path
    bridge.start();

    // Auto-install or update PanelBridge mod
    const { modInstalled, modUpdated } = await installOrUpdateMod(
      targetServer,
      modCandidateDirs(__dirname),
    );

    res.json({
      success: true,
      message: `Bridge auto-configured from server: ${targetServer.name}`,
      bridgePath: foundPath.path,
      serverName,
      source: foundPath.source,
      hasStatus: foundPath.hasStatus,
      modInstalled,
      modUpdated,
      searchedPaths: searchedLocations,
    });
    log.info(
      `Bridge auto-configured: path=${foundPath.path} source=${foundPath.source} hasStatus=${foundPath.hasStatus} modInstalled=${modInstalled}`,
    );
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Scan for bridge paths for a specific server (preview before applying)
router.get("/scan-server/:serverId", async (req, res) => {
  try {
    const { serverId } = req.params;
    const targetServer = await getServer(serverId);

    if (!targetServer) {
      return res.status(404).json({
        success: false,
        error: `Server with ID ${serverId} not found.`,
      });
    }

    const serverName = targetServer.serverName || targetServer.name;
    if (!serverName) {
      return res
        .status(400)
        .json({ success: false, error: "Server name not configured." });
    }

    const { possiblePaths, recommendedPath } = scanServerPreviewPaths(
      targetServer,
      serverName,
    );

    res.json({
      success: true,
      serverName,
      serverId: targetServer.id,
      paths: possiblePaths,
      recommendedPath: recommendedPath?.path || null,
      recommendedSource: recommendedPath?.source || null,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: sanitizeError(error.message) });
  }
});

// Auto-detect bridge path from server name
router.post("/auto-detect", async (req, res) => {
  const { serverName, zomboidUserFolder } = req.body;

  if (!serverName) {
    return res.status(400).json({ error: "serverName is required" });
  }

  try {
    await bridge.stopSftp();
    // Stop bridge first if already running so watcher/poller restarts on new path
    if (bridge.isRunning) {
      bridge.stop();
    }
    const bridgePath = bridge.autoDetect(serverName, zomboidUserFolder);
    bridge.start();
    res.json({
      success: true,
      message: "Bridge auto-configured and started",
      bridgePath,
    });
  } catch (error) {
    res.status(400).json({ error: sanitizeError(error.message) });
  }
});

// Configure the bridge with Zomboid save path
router.post("/configure", async (req, res) => {
  const { zomboidSavePath } = req.body;

  if (!zomboidSavePath) {
    return res.status(400).json({ error: "zomboidSavePath is required" });
  }

  try {
    await bridge.stopSftp();
    // Stop bridge first if already running so watcher/poller restarts on new path
    if (bridge.isRunning) {
      bridge.stop();
    }
    const bridgePath = bridge.configure(zomboidSavePath);
    // Also start the bridge automatically after configuring
    bridge.start();
    res.json({
      success: true,
      message: "Bridge configured and started",
      bridgePath,
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Configure the bridge with a direct panelbridge folder path (manual override)
router.post("/configure-direct", async (req, res) => {
  const { bridgePath: reqPath } = req.body;

  if (!reqPath || typeof reqPath !== "string") {
    return res.status(400).json({ error: "bridgePath is required" });
  }

  // Basic validation: must be an absolute path
  const resolved = path.resolve(reqPath);
  if (!path.isAbsolute(resolved)) {
    return res.status(400).json({ error: "Path must be absolute" });
  }

  // Block obvious system dirs
  const lower =
    process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const blocked =
    process.platform === "win32"
      ? ["c:\\windows", "c:\\program files"]
      : ["/etc", "/usr", "/bin", "/sbin", "/proc", "/sys", "/dev"];
  if (blocked.some((p) => lower.startsWith(p))) {
    return res
      .status(400)
      .json({ error: "Path targets a protected system directory" });
  }

  try {
    await bridge.stopSftp();
    if (bridge.isRunning) {
      bridge.stop();
    }
    const configuredPath = bridge.configure(resolved, true);
    bridge.start();
    res.json({
      success: true,
      message: "Bridge configured with manual path and started",
      bridgePath: configuredPath,
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
