import express from "express";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { getActiveServer } from "../../database/init.js";
import { requireRole } from "../../services/auth.js";
import {
  runSafeModUpdate,
  isSafeUpdateInProgress,
  clampWarningSeconds,
} from "../../services/safeModUpdate.js";

const log = createLogger("API:Mods:SafeUpdate");
const router = express.Router();

// Orchestrates the full "update mods safely" flow in one call: backup, check
// for updates, warn players, restart, verify boot. Runs in the background —
// the client follows progress via the `modUpdate:step` socket event, the
// same fire-and-forget pattern POST /api/server/restart uses.
router.post("/safe-update", requireRole("admin"), async (req, res) => {
  try {
    const modChecker = req.app.get("modChecker");
    const backupService = req.app.get("backupService");
    const serverManager = req.app.get("serverManager");
    const rconService = req.app.get("rconService");
    const io = req.app.get("io");

    if (!modChecker || !backupService || !serverManager || !rconService) {
      return res
        .status(500)
        .json({ error: "Required services are not initialized" });
    }

    const activeServer = await getActiveServer();
    if (activeServer?.isRemote) {
      return res.status(400).json({
        error:
          "Safe update is not available for remote servers. The server filesystem and process are not managed by this panel.",
      });
    }

    if (isSafeUpdateInProgress()) {
      return res
        .status(409)
        .json({ error: "A safe update is already in progress" });
    }

    const running = await serverManager.checkServerRunning();
    if (!running) {
      return res.status(400).json({
        error:
          "Server is not running. Start the server before running a safe update.",
      });
    }
    if (!rconService.connected) {
      return res.status(400).json({
        error:
          "RCON is not connected. Cannot safely warn players or restart.",
      });
    }

    const warningSeconds = clampWarningSeconds(req.body?.warningSeconds);

    log.info(`POST /safe-update — starting (warningSeconds=${warningSeconds})`);
    runSafeModUpdate({
      modChecker,
      backupService,
      serverManager,
      rconService,
      io,
      warningSeconds,
    }).catch((error) => {
      log.error(`Safe mod update failed: ${error.message}`);
    });

    res.json({ success: true, message: "Safe update started", warningSeconds });
  } catch (error) {
    log.error(`Failed to start safe update: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Lets the frontend re-sync progress-panel state after a page reload while
// an update is mid-flight (it otherwise only learns via the socket event).
router.get("/safe-update/status", (req, res) => {
  res.json({ inProgress: isSafeUpdateInProgress() });
});

export default router;
