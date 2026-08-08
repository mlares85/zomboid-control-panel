// SteamCMD-driven install of a new PZ dedicated server.
// Other SteamCMD-related routes (quick-setup, steam-update, steamcmd
// download/check/detect, branch listing, delete-files) live in their own
// sibling files and are registered here too, so `install.js` remains the
// single entry point for the whole "install" domain.
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";
import {
  isValidPath,
  isValidServerName,
  validateInt,
  sanitizeForBatch,
  resolveZomboidPaths,
  checkWritableOrError,
} from "./shared.js";
import {
  getSteamCmdExe,
  ensureSteamCmdLinux,
  hasActiveSteamOperation,
  activeSteamOperations,
  getBetaArgs,
  getSteamLoginArgs,
  attachSteamCmdLineStreaming,
  isWindows,
} from "./steamcmd.js";
import { completeSuccessfulInstall } from "./installComplete.js";
import { registerQuickSetupRoutes } from "./quickSetup.js";
import { registerSteamUpdateRoutes } from "./steamUpdate.js";
import { registerSteamcmdInfoRoutes } from "./steamcmdInfo.js";
import { registerDeleteFilesRoute } from "./deleteFiles.js";

const log = createLogger("API:Server");

export function registerInstallRoutes(router) {
  registerInstallRoute(router);
  registerQuickSetupRoutes(router);
  registerSteamUpdateRoutes(router);
  registerSteamcmdInfoRoutes(router);
  registerDeleteFilesRoute(router);
}

function registerInstallRoute(router) {
  // SteamCMD Installation endpoint
  router.post("/install", async (req, res) => {
    try {
      const {
        steamcmdPath,
        installPath,
        serverName,
        branch,
        useUnstable, // Legacy support
        // New options
        zomboidDataPath,
        minMemory = 4,
        maxMemory = 8,
        adminPassword,
        serverPort = 16261,
        useUpnp = true,
        useNoSteam = false,
        useDebug = false,
        // RCON settings
        rconPassword,
        rconPort = 27015,
      } = req.body;

      // Determine branch - support both new 'branch' param and legacy 'useUnstable'
      const selectedBranch = branch || (useUnstable ? "unstable" : "stable");
      log.info(
        `POST /install (steamcmd=${steamcmdPath}, install=${installPath}, server=${serverName}, branch=${selectedBranch}, noSteam=${useNoSteam}, debug=${useDebug})`,
      );

      // Validate paths - Security check for path traversal
      if (!steamcmdPath || !installPath || !serverName) {
        return res.status(400).json({
          error: "Missing required fields: steamcmdPath, installPath, serverName",
        });
      }

      if (!isValidPath(steamcmdPath)) {
        return res.status(400).json({ error: "Invalid SteamCMD path" });
      }

      if (!isValidPath(installPath)) {
        return res.status(400).json({ error: "Invalid install path" });
      }

      if (!isValidServerName(serverName)) {
        return res.status(400).json({
          error:
            "Invalid server name. Use only letters, numbers, underscores, hyphens, and spaces (max 64 chars)",
        });
      }

      if (zomboidDataPath && !isValidPath(zomboidDataPath)) {
        return res.status(400).json({ error: "Invalid Zomboid data path" });
      }

      const { zomboidPath, serverConfigPath, usesEnvironmentDataPath } =
        resolveZomboidPaths(installPath, zomboidDataPath);

      const installPathError = checkWritableOrError(
        installPath,
        "Installation path",
      );
      if (installPathError) {
        return res.status(400).json({ error: installPathError });
      }

      const dataPathError = checkWritableOrError(
        serverConfigPath,
        "Zomboid data folder",
        zomboidPath,
      );
      if (dataPathError) {
        return res.status(400).json({ error: dataPathError });
      }

      // Validate numeric inputs
      const safeMinMemory = validateInt(minMemory, 1, 64, 4);
      const safeMaxMemory = validateInt(maxMemory, 1, 128, 8);
      const safeServerPort = validateInt(serverPort, 1024, 65535, 16261);
      const safeRconPort = validateInt(rconPort, 1024, 65535, 27015);

      // Sanitize string inputs for batch file
      const safeAdminPassword = sanitizeForBatch(adminPassword);

      // Check if steamcmd exists — auto-download it on Linux instead of
      // hard-failing (see ensureSteamCmdLinux for why: fresh volumes, or a
      // previous install that never finished, shouldn't force a manual
      // re-run of the setup wizard).
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

      // Prevent concurrent operations on the same install path
      const normalizedPath = path.normalize(installPath).toLowerCase();
      if (hasActiveSteamOperation(normalizedPath)) {
        return res.status(409).json({
          error:
            "A Steam operation is already in progress for this path. Please wait for it to complete.",
        });
      }

      log.info(
        `Starting PZ server installation to ${installPath} (branch: ${selectedBranch})`,
      );

      // Mark operation as active
      activeSteamOperations.set(normalizedPath, {
        type: "install",
        startTime: Date.now(),
        branch: selectedBranch,
        serverName,
      });

      // Build SteamCMD command
      // App ID 380870 is Project Zomboid Dedicated Server
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

      // Spawn SteamCMD process
      // On Linux, set LD_LIBRARY_PATH so SteamCMD can find its 32-bit libraries
      const spawnOpts = { cwd: steamcmdPath };
      if (!isWindows) {
        const ldPaths = [
          path.join(steamcmdPath, "linux32"),
          path.join(steamcmdPath, "linux64"),
          steamcmdPath,
          process.env.LD_LIBRARY_PATH || "",
        ]
          .filter(Boolean)
          .join(":");
        spawnOpts.env = { ...process.env, LD_LIBRARY_PATH: ldPaths };
      }
      const steamcmd = spawn(steamcmdExe, steamcmdArgs, spawnOpts);
      activeSteamOperations.get(normalizedPath).pid = steamcmd.pid;

      const streaming = attachSteamCmdLineStreaming(steamcmd, io, "install:log", {
        logFlush: true,
      });

      steamcmd.on("close", async (code) => {
        streaming.flush();

        if (code === 0) {
          await completeSuccessfulInstall({
            io,
            installPath,
            serverName,
            selectedBranch,
            zomboidDataPath,
            zomboidPath,
            usesEnvironmentDataPath,
            serverConfigPath,
            minMemory,
            maxMemory,
            serverPort,
            useUpnp,
            rconPassword,
            rconPort,
            safeRconPort,
            safeMinMemory,
            safeMaxMemory,
            safeServerPort,
            safeAdminPassword,
            useNoSteam,
            useDebug,
          });
        } else {
          log.error(`SteamCMD exited with code ${code}`);
          io.emit("install:complete", {
            success: false,
            message: `Installation failed with exit code ${code}`,
            output: streaming.getOutput(),
          });
        }

        // Clear active operation
        activeSteamOperations.delete(normalizedPath);
      });

      steamcmd.on("error", (error) => {
        // Clear active operation on error
        activeSteamOperations.delete(normalizedPath);

        log.error(`SteamCMD error: ${error.message}`);
        io.emit("install:complete", {
          success: false,
          message: `Failed to run SteamCMD: ${sanitizeError(error.message)}`,
        });
      });

      // Return immediately - progress is sent via Socket.IO
      res.json({
        success: true,
        message: "Installation started. Check the log for progress.",
        installPath,
        branch: selectedBranch,
      });
    } catch (error) {
      log.error(`Installation error: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}
