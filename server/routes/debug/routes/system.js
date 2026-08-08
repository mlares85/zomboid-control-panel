import express from "express";
import fs from "fs";
import os from "os";
import v8 from "v8";
import { createLogger } from "../../../utils/logger.js";
import { getDataPaths } from "../../../utils/paths.js";
import { sanitizeError } from "../../../utils/sanitize.js";

const log = createLogger("API:Debug");
const router = express.Router();

// Get system RAM info for auto-configuration
router.get("/ram", async (req, res) => {
  try {
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const totalMemGB = Math.floor(totalMemBytes / (1024 * 1024 * 1024));
    const freeMemGB = Math.floor(freeMemBytes / (1024 * 1024 * 1024));

    // Calculate recommended settings
    // Reserve ~4GB for OS/other apps, use 50-75% of remaining for server
    const availableForServer = Math.max(1, totalMemGB - 4);
    const recommendedMax = Math.min(Math.floor(availableForServer * 0.75), 16); // Cap at 16GB
    const recommendedMin = Math.max(1, Math.floor(recommendedMax * 0.5)); // Min is 50% of max

    res.json({
      totalGB: totalMemGB,
      freeGB: freeMemGB,
      recommendedMin,
      recommendedMax,
    });
  } catch (error) {
    log.error(`Failed to get RAM info: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Get system information
router.get("/system", async (req, res) => {
  try {
    const paths = getDataPaths();

    // Redact full filesystem paths to relative/basename for security
    const redactPath = (p) => {
      if (!p) return "Not configured";
      // Show only the last 2 path segments (e.g., "data/db.json")
      const segments = p.replace(/\\/g, "/").split("/").filter(Boolean);
      return segments.length > 2
        ? ".../" + segments.slice(-2).join("/")
        : segments.join("/");
    };

    res.json({
      nodeVersion: process.version,
      platform: process.platform,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      dbPath: fs.existsSync(paths.dbPath)
        ? redactPath(paths.dbPath)
        : "Not found",
      logsPath: fs.existsSync(paths.logsDir)
        ? redactPath(paths.logsDir)
        : "Not found",
      dataDir: redactPath(paths.dataDir),
      pathsConfigurable: true,
      env: {
        NODE_ENV: process.env.NODE_ENV || "development",
        PORT: process.env.PORT || 3001,
        LOG_LEVEL: process.env.LOG_LEVEL || "info",
      },
    });
  } catch (error) {
    log.error(`Failed to get system info: ${error.message}`);
    res.status(500).json({ error: "Failed to get system info" });
  }
});
// Health check with details
router.get("/health", async (req, res) => {
  try {
    const rconService = req.app.get("rconService");
    const serverManager = req.app.get("serverManager");
    const modChecker = req.app.get("modChecker");

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        rcon: {
          connected: rconService?.isConnected?.() || false,
          host: rconService?.config?.host || "not configured",
        },
        server: {
          running: (await serverManager?.checkServerRunning?.()) || false,
        },
        modChecker: {
          running: modChecker?.isRunning || false,
          interval: modChecker?.checkInterval || 0,
        },
      },
      // heapLimit is the real V8 ceiling (what --max-old-space-size controls);
      // heapTotal is just the currently-allocated segment size, which grows
      // on demand and is not a meaningful "how close to OOM" signal on its
      // own — see the runtime.heap diagnostic check for why.
      memory: {
        ...process.memoryUsage(),
        heapLimit: v8.getHeapStatistics().heap_size_limit,
      },
      uptime: process.uptime(),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: sanitizeError(error.message),
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
