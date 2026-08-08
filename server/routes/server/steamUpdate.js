// Update/verify an existing PZ server install via SteamCMD.
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { createLogger } from "../../utils/logger.js";
import { logServerEvent, getSetting } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { isValidPath } from "./shared.js";
import {
  getSteamCmdExe,
  ensureSteamCmdLinux,
  hasActiveSteamOperation,
  activeSteamOperations,
  recoverMismatchedSteamBranchManifest,
  getBetaArgs,
  getSteamLoginArgs,
  attachSteamCmdLineStreaming,
  isWindows,
} from "./steamcmd.js";

const log = createLogger("API:Server");

export function registerSteamUpdateRoutes(router) {
  // Update server using SteamCMD
  router.post("/steam-update", async (req, res) => {
    try {
      let {
        steamcmdPath,
        installPath,
        branch,
        useUnstable = false,
        validateFiles = false,
      } = req.body;

      // Determine branch - support both new 'branch' param and legacy 'useUnstable'
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
            error:
              "Server is currently running. Please stop the server before updating.",
          });
        }
      } catch (e) {
        log.warn(`Could not verify server status before update: ${e.message}`);
        // Continue anyway - user may be updating a different server
      }

      // Prevent concurrent operations on the same install path
      const normalizedPath = path.normalize(installPath).toLowerCase();
      if (hasActiveSteamOperation(normalizedPath)) {
        return res.status(409).json({
          error:
            "A Steam operation is already in progress for this server. Please wait for it to complete.",
        });
      }

      // Auto-download SteamCMD on Linux instead of hard-failing — see
      // ensureSteamCmdLinux.
      let steamcmdExe = getSteamCmdExe(steamcmdPath);
      if (!fs.existsSync(steamcmdExe)) {
        if (isWindows) {
          return res
            .status(400)
            .json({ error: `SteamCMD not found at: ${steamcmdExe}` });
        }
        try {
          steamcmdExe = await ensureSteamCmdLinux(
            steamcmdPath,
            req.app.get("io"),
          );
        } catch (dlErr) {
          return res.status(500).json({
            error: `SteamCMD not found and auto-download failed: ${sanitizeError(dlErr.message)}`,
          });
        }
      }

      try {
        const recovery = recoverMismatchedSteamBranchManifest(
          installPath,
          selectedBranch,
        );
        if (recovery) {
          log.warn(
            `Reset stale SteamCMD branch manifest (${recovery.mountedBranch} -> ${recovery.targetBranch}); backup: ${recovery.backupPath}`,
          );
        }
      } catch (error) {
        log.warn(`Could not inspect SteamCMD branch manifest: ${error.message}`);
      }

      const operation = validateFiles ? "verification" : "update";
      log.info(`Starting PZ server ${operation} (branch: ${selectedBranch})...`);

      // Mark operation as active
      activeSteamOperations.set(normalizedPath, {
        type: operation,
        startTime: Date.now(),
        branch: selectedBranch,
      });

      // Build SteamCMD command
      const betaArgs = getBetaArgs(selectedBranch);
      const loginArgs = await getSteamLoginArgs();
      const steamcmdArgs = [
        "+force_install_dir",
        installPath,
        ...loginArgs,
        "+app_update",
        "380870",
        ...betaArgs,
        "validate",
        "+quit",
      ];

      const io = req.app.get("io");

      // Emit start event
      io.emit("steam:start", {
        type: validateFiles ? "verify" : "update",
        message: validateFiles ? "Verifying game files..." : "Updating server...",
      });

      // On Linux, set LD_LIBRARY_PATH so SteamCMD can find its 32-bit libraries
      const updateSpawnOpts = { cwd: steamcmdPath };
      if (!isWindows) {
        const ldPaths = [
          path.join(steamcmdPath, "linux32"),
          path.join(steamcmdPath, "linux64"),
          steamcmdPath,
          process.env.LD_LIBRARY_PATH || "",
        ]
          .filter(Boolean)
          .join(":");
        updateSpawnOpts.env = { ...process.env, LD_LIBRARY_PATH: ldPaths };
      }
      const steamcmd = spawn(steamcmdExe, steamcmdArgs, updateSpawnOpts);
      activeSteamOperations.get(normalizedPath).pid = steamcmd.pid;

      const streaming = attachSteamCmdLineStreaming(steamcmd, io, "steam:log");

      steamcmd.on("close", (code) => {
        streaming.flush();

        // Clear active operation
        activeSteamOperations.delete(normalizedPath);

        const success = code === 0;
        const output = streaming.getOutput();
        const steamDepotAccessDenied =
          /app ['"]?380870['"]? state is 0x6/i.test(output) ||
          /manifest.*access denied/i.test(output);
        const failureMessage = steamDepotAccessDenied
          ? "SteamCMD could not access a Project Zomboid depot manifest. Your installed server files were not changed. Retry later; if it persists, update using a Steam account that owns Project Zomboid."
          : `Server ${operation} failed with code ${code}`;

        io.emit("steam:complete", {
          success,
          message: success
            ? `Server ${operation} completed successfully`
            : failureMessage,
        });

        // After successful update, re-check update status so banner clears
        if (success) {
          try {
            const updateChecker = req.app.get("updateChecker");
            if (updateChecker) {
              setTimeout(() => updateChecker.checkForUpdates(true), 3000);
            }
          } catch (e) {
            // Non-critical
          }
        }

        logServerEvent(
          success ? "server_update" : "server_update_failed",
          `Server ${operation} ${success ? "completed" : "failed"}`,
        ).catch((e) => log.error("Failed to log server event:", e));

        log.info(`SteamCMD ${operation} finished with code ${code}`);
      });

      steamcmd.on("error", (error) => {
        // Clear active operation on error
        activeSteamOperations.delete(normalizedPath);

        io.emit("steam:complete", {
          success: false,
          message: `Failed to run SteamCMD: ${sanitizeError(error.message)}`,
        });
        log.error(`SteamCMD error: ${error.message}`);
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
