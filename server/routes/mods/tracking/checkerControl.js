import express from "express";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import { requireModChecker } from "../../../middleware/requireModChecker.js";

const log = createLogger("API:Mods");
const router = express.Router();

// Manually check for mod updates
router.post("/check-updates", requireModChecker, async (req, res) => {
  try {
    const result = await req.modChecker.checkForUpdates();
    res.json(result);
  } catch (error) {
    log.error(`Failed to check for updates: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Get mod list from server config
router.get("/server-mods", async (req, res) => {
  try {
    const serverManager = req.app.get("serverManager");
    const mods = await serverManager.getModList();
    res.json({ mods });
  } catch (error) {
    log.error(`Failed to get server mods: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Check mods via RCON
router.get("/check-rcon", async (req, res) => {
  try {
    const rconService = req.app.get("rconService");
    const result = await rconService.checkModsNeedUpdate();
    res.json(result);
  } catch (error) {
    log.error(`Failed to check mods via RCON: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Start mod checker
router.post("/start", requireModChecker, async (req, res) => {
  try {
    await req.modChecker.start();
    res.json({ success: true, message: "Mod checker started" });
  } catch (error) {
    log.error(`Failed to start mod checker: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Stop mod checker
router.post("/stop", requireModChecker, async (req, res) => {
  try {
    req.modChecker.stop();
    res.json({ success: true, message: "Mod checker stopped" });
  } catch (error) {
    log.error(`Failed to stop mod checker: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Set check interval
router.put("/interval", requireModChecker, async (req, res) => {
  try {
    const { intervalMs } = req.body || {};

    if (
      !Number.isInteger(intervalMs) ||
      intervalMs < 60000 ||
      intervalMs > 120 * 60 * 1000 ||
      intervalMs % 60000 !== 0
    ) {
      return res.status(400).json({
        error:
          "Interval must be a whole number of minutes from 60000ms to 7200000ms",
      });
    }

    await req.modChecker.setCheckInterval(intervalMs);
    res.json({
      success: true,
      message: `Check interval set to ${intervalMs}ms`,
    });
  } catch (error) {
    log.error(`Failed to set check interval: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Enable auto-restart on mod update
router.post("/auto-restart", requireModChecker, async (req, res) => {
  try {
    const modChecker = req.modChecker;
    const { enabled } = req.body || {};
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "`enabled` must be a boolean" });
    }

    if (enabled) {
      await modChecker.setUpdateCallback(async (updatedMods) => {
        const handled = await modChecker.handleModUpdate(updatedMods);
        if (!handled?.success) {
          log.warn(
            `Mod update handling failed: ${handled?.error || handled?.message || "unknown error"}`,
          );
        }
      });
    } else {
      await modChecker.setUpdateCallback(null);
    }

    res.json({ success: true, autoRestart: enabled });
  } catch (error) {
    log.error(`Failed to configure auto-restart: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Configure restart options
router.put("/restart-options", requireModChecker, async (req, res) => {
  try {
    const modChecker = req.modChecker;
    const {
      warningMinutes,
      delayIfPlayersOnline,
      maxDelayMinutes,
      checkInterval,
    } = req.body || {};

    // Validate each field if present. Allow undefined (means "don't change").
    const inRange = (v, min, max) =>
      Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max;
    if (warningMinutes !== undefined && !inRange(warningMinutes, 0, 1440)) {
      return res.status(400).json({ error: "warningMinutes must be 0-1440" });
    }
    if (maxDelayMinutes !== undefined && !inRange(maxDelayMinutes, 0, 1440)) {
      return res.status(400).json({ error: "maxDelayMinutes must be 0-1440" });
    }
    if (
      checkInterval !== undefined &&
      (!inRange(checkInterval, 60_000, 120 * 60 * 1000) ||
        !Number.isInteger(Number(checkInterval)) ||
        Number(checkInterval) % 60_000 !== 0)
    ) {
      return res.status(400).json({
        error:
          "checkInterval must be a whole number of minutes from 60000ms to 7200000ms",
      });
    }
    if (
      delayIfPlayersOnline !== undefined &&
      typeof delayIfPlayersOnline !== "boolean"
    ) {
      return res
        .status(400)
        .json({ error: "delayIfPlayersOnline must be a boolean" });
    }

    await modChecker.setRestartOptions({
      warningMinutes,
      delayIfPlayersOnline,
      maxDelayMinutes,
      checkInterval,
    });

    const status = await modChecker.getStatus();
    res.json({
      success: true,
      options: {
        warningMinutes: status.restartWarningMinutes,
        delayIfPlayersOnline: status.delayIfPlayersOnline,
        maxDelayMinutes: status.maxDelayMinutes,
        checkInterval: status.checkInterval,
      },
    });
  } catch (error) {
    log.error(`Failed to set restart options: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Get workshop ACF status (Steam API key no longer needed - using local ACF file)
router.get("/workshop-status", requireModChecker, async (req, res) => {
  try {
    const status = await req.modChecker.getStatus();

    res.json({
      success: true,
      configured: status.workshopAcfConfigured,
      workshopAcfPath: status.workshopAcfPath,
      message: status.workshopAcfConfigured
        ? "Workshop ACF file found - mod updates can be detected automatically"
        : "Workshop ACF file not found - ensure server install path is correct",
    });
  } catch (error) {
    log.error(`Failed to get workshop status: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Cancel pending restart (if waiting for players)
router.post("/cancel-pending-restart", requireModChecker, async (req, res) => {
  try {
    const modChecker = req.modChecker;
    if (!modChecker.pendingRestart) {
      return res.json({
        success: false,
        message: "No pending restart to cancel",
      });
    }

    modChecker.cancelPendingRestart();
    res.json({ success: true, message: "Pending restart cancelled" });
  } catch (error) {
    log.error(`Failed to cancel pending restart: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
