// Update/verify an existing PZ server install via SteamCMD.
import { createLogger } from "../../utils/logger.js";
import { logServerEvent, getSetting } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { isValidPath } from "./shared.js";
import { getNativeInstaller } from "../../services/installer/index.js";

const log = createLogger("API:Server");

export function registerSteamUpdateRoutes(router) {
  router.post("/steam-update", async (req, res) => {
    try {
      let {
        steamcmdPath,
        installPath,
        branch,
        useUnstable = false,
        validateFiles = false,
      } = req.body;

      const selectedBranch = branch || (useUnstable ? "unstable" : "stable");

      // Auto-load steamcmdPath from settings if not provided
      if (!steamcmdPath) {
        steamcmdPath = await getSetting("steamcmdPath");
      }

      if (!steamcmdPath || !installPath) {
        return res
          .status(400)
          .json({ error: "Missing required fields: steamcmdPath, installPath" });
      }

      if (!isValidPath(steamcmdPath)) {
        return res.status(400).json({ error: "Invalid SteamCMD path" });
      }

      if (!isValidPath(installPath)) {
        return res.status(400).json({ error: "Invalid install path" });
      }

      // Check if server is running - cannot update while running
      const serverManager = req.app.get("serverManager");
      try {
        const isRunning = await serverManager.checkServerRunning();
        if (isRunning) {
          return res.status(400).json({
            error: "Server is currently running. Please stop the server before updating.",
          });
        }
      } catch (e) {
        log.warn(`Could not verify server status before update: ${e.message}`);
      }

      const operation = validateFiles ? "verification" : "update";
      log.info(`Starting PZ server ${operation} (branch: ${selectedBranch})...`);

      // ── Delegate to installer service ──────────────────────────────
      const io = req.app.get("io");
      const installer = getNativeInstaller();

      // Bridge installer progress events to Socket.IO
      const onProgress = (event, data) => {
        if (event === "log") io.emit("steam:log", data);
        else if (event === "start") io.emit("steam:start", data);
      };

      // Fire-and-forget — result comes via Socket.IO
      installer.update({
        steamcmdPath,
        installPath,
        branch: selectedBranch,
        validate: validateFiles,
        onProgress,
      })
        .then((result) => {
          io.emit("steam:complete", {
            success: result.success,
            message: result.success
              ? `Server ${operation} completed successfully`
              : result.error,
          });

          if (result.success) {
            try {
              const updateChecker = req.app.get("updateChecker");
              if (updateChecker) {
                setTimeout(() => updateChecker.checkForUpdates(true), 3000);
              }
            } catch {
              // Non-critical
            }
          }

          logServerEvent(
            result.success ? "server_update" : "server_update_failed",
            `Server ${operation} ${result.success ? "completed" : "failed"}`,
          ).catch((e) => log.error("Failed to log server event:", e));

          log.info(`SteamCMD ${operation} finished (success=${result.success})`);
        })
        .catch((err) => {
          io.emit("steam:complete", {
            success: false,
            message: `Failed to run SteamCMD: ${sanitizeError(err.message)}`,
          });
          log.error(`SteamCMD error: ${err.message}`);
        });

      res.json({
        success: true,
        message: `Server ${operation} started`,
      });
    } catch (error) {
      log.error(`Steam update failed: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}
