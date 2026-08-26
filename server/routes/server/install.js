// SteamCMD-driven install of a new PZ dedicated server.
// Other SteamCMD-related routes (quick-setup, steam-update, steamcmd
// download/check/detect, branch listing, delete-files) live in their own
// sibling files and are registered here too, so `install.js` remains the
// single entry point for the whole "install" domain.
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
import { getNativeInstaller } from "../../services/installer/index.js";
import { completeSuccessfulInstall } from "./installComplete.js";
import { statDisk } from "../../services/diskMonitor.js";
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
        zomboidDataPath,
        minMemory = 4,
        maxMemory = 8,
        adminPassword,
        serverPort = 16261,
        useUpnp = true,
        useNoSteam = false,
        useDebug = false,
        rconPassword,
        rconPort = 27015,
      } = req.body;

      const selectedBranch = branch || (useUnstable ? "unstable" : "stable");
      log.info(
        `POST /install (steamcmd=${steamcmdPath}, install=${installPath}, server=${serverName}, branch=${selectedBranch})`,
      );

      // ── Input validation (stays in the route) ──────────────────────
      const validationError = validateInstallInput({
        steamcmdPath, installPath, serverName, zomboidDataPath,
      });
      if (validationError) return res.status(400).json({ error: validationError });

      const { zomboidPath, serverConfigPath, usesEnvironmentDataPath } =
        resolveZomboidPaths(installPath, zomboidDataPath);

      const installPathError = checkWritableOrError(installPath, "Installation path");
      if (installPathError) return res.status(400).json({ error: installPathError });

      const dataPathError = checkWritableOrError(serverConfigPath, "Zomboid data folder", zomboidPath);
      if (dataPathError) return res.status(400).json({ error: dataPathError });

      // Preflight: PZ Build 42 server is ~7 GB. Require 8 GB so there's
      // room for saves/config alongside the install. Block early instead of
      // letting SteamCMD fail midway through a multi-GB download.
      const MIN_DISK_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB
      const disk = await statDisk(installPath);
      if (disk && disk.freeBytes < MIN_DISK_BYTES) {
        const freeGB = (disk.freeBytes / (1024 * 1024 * 1024)).toFixed(1);
        return res.status(400).json({
          error: `Not enough disk space. The PZ server needs at least 8 GB ` +
            `but only ${freeGB} GB is free on the install drive. ` +
            `Free up space or choose a different install folder.`,
        });
      }

      const safeMinMemory = validateInt(minMemory, 1, 64, 4);
      const safeMaxMemory = validateInt(maxMemory, 1, 128, 8);
      const safeServerPort = validateInt(serverPort, 1024, 65535, 16261);
      const safeRconPort = validateInt(rconPort, 1024, 65535, 27015);
      const safeAdminPassword = sanitizeForBatch(adminPassword);

      // ── Delegate to installer service ──────────────────────────────
      const io = req.app.get("io");
      const installer = getNativeInstaller();

      // Bridge installer progress events to Socket.IO
      const onProgress = (event, data) => {
        if (event === "log") io.emit("install:log", data);
        else if (event === "status") io.emit("steamcmd:status", data);
      };

      // Fire-and-forget — result comes via Socket.IO, not HTTP
      installer.install({ steamcmdPath, installPath, branch: selectedBranch, onProgress })
        .then(async (result) => {
          if (result.success) {
            await completeSuccessfulInstall({
              io, installPath, serverName, selectedBranch,
              zomboidDataPath, zomboidPath, usesEnvironmentDataPath,
              serverConfigPath, minMemory, maxMemory, serverPort, useUpnp,
              rconPassword, rconPort, safeRconPort, safeMinMemory,
              safeMaxMemory, safeServerPort, safeAdminPassword,
              useNoSteam, useDebug,
            });
          } else {
            log.error(`Installation failed: ${result.error}`);
            io.emit("install:complete", {
              success: false,
              message: result.error,
            });
          }
        })
        .catch((err) => {
          log.error(`Installation error: ${err.message}`);
          io.emit("install:complete", {
            success: false,
            message: sanitizeError(err.message),
          });
        });

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

function validateInstallInput({ steamcmdPath, installPath, serverName, zomboidDataPath }) {
  if (!steamcmdPath || !installPath || !serverName) {
    return "Missing required fields: steamcmdPath, installPath, serverName";
  }
  if (!isValidPath(steamcmdPath)) return "Invalid SteamCMD path";
  if (!isValidPath(installPath)) return "Invalid install path";
  if (!isValidServerName(serverName)) {
    return "Invalid server name. Use only letters, numbers, underscores, hyphens, and spaces (max 64 chars)";
  }
  if (zomboidDataPath && !isValidPath(zomboidDataPath)) return "Invalid Zomboid data path";
  return null;
}
