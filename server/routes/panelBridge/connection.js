/**
 * Bridge lifecycle: status, start/stop, refresh, ping, server info, and the
 * "find any panelbridge folder" filesystem scan.
 */

import express from "express";
import bridge from "../../services/panelBridge.js";
import { getActiveServer } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import {
  requireBridgeConfigured,
  requireBridgeRunning,
} from "../../middleware/panelBridgeGuards.js";
import { scanKnownBridgeLocations } from "../../services/panelBridgeScan.js";

const router = express.Router();

// Get bridge status
router.get("/status", async (req, res) => {
  const status = await bridge.getStatus();

  // Also include detected paths from active server
  let detectedPaths = null;
  try {
    const activeServer = await getActiveServer();
    if (activeServer) {
      detectedPaths = {
        serverName: activeServer.serverName || activeServer.name,
        installPath: activeServer.installPath,
        zomboidDataPath: activeServer.zomboidDataPath,
        // Bridge path would be: zomboidDataPath/Saves/Multiplayer/{serverName}/panelbridge/
        // OR for dedicated servers: installPath/../Server_files/Saves/Multiplayer/{serverName}/panelbridge/
      };
    }
  } catch (e) {
    // Ignore
  }

  res.json({
    ...status,
    modConnected: bridge.isModConnected(),
    detectedPaths,
  });
});

// Start the bridge polling
router.post("/start", async (req, res) => {
  try {
    await bridge.start();
    res.json({ success: true, message: "Bridge started" });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Stop the bridge
router.post("/stop", async (req, res) => {
  try {
    await bridge.stopSftp();
    bridge.stop();
    res.json({ success: true, message: "Bridge stopped" });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Scan for all panelbridge folders across known locations
router.get("/scan-paths", async (req, res) => {
  try {
    const activeServer = await getActiveServer();
    const { foundBridges, scannedDirs } = await scanKnownBridgeLocations({
      activeServer,
      currentBridgePath: bridge.bridgePath,
    });

    res.json({
      foundBridges,
      scannedDirs,
      currentPath: bridge.bridgePath,
      isRunning: bridge.isRunning,
      modConnected: bridge.isModConnected(),
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Force refresh - restart bridge with fresh state
router.post("/refresh", async (req, res) => {
  try {
    if (bridge.isRunning) {
      bridge.stop(); // stop() already resets all internal state
    }

    if (bridge.bridgePath) {
      await bridge.start();
      res.json({
        success: true,
        message: "Bridge refreshed",
        bridgePath: bridge.bridgePath,
      });
    } else {
      res.json({
        success: false,
        message: "Bridge not configured - use auto-configure first",
        fixUrl: "/settings?tab=bridge",
      });
    }
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Ping the mod
router.get("/ping", requireBridgeConfigured, async (req, res) => {
  try {
    const result = await bridge.ping();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Get server info
router.get(
  "/server-info",
  requireBridgeConfigured,
  requireBridgeRunning(),
  async (req, res) => {
    try {
      const result = await bridge.getServerInfo();
      // Lua JSON encodes empty tables as {} (object) instead of [] (array)
      if (result?.data?.players && !Array.isArray(result.data.players)) {
        result.data.players = Object.values(result.data.players);
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  },
);

export default router;
