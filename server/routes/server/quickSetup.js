// Quick Setup - Create new server config using existing files (no SteamCMD download)
import path from "path";
import { createLogger } from "../../utils/logger.js";
import { setSetting, logServerEvent } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import {
  isValidPath,
  isValidServerName,
  validateInt,
  sanitizeForBatch,
  resolveZomboidPaths,
  checkWritableOrError,
  ensureWritableDirectory,
} from "./shared.js";
import { generateStartupScripts, writeStartupScriptFiles } from "./startupScripts.js";
import { precreateRconIni, installPanelBridgeMod } from "./installHelpers.js";
import { LocalFiles } from "../../services/fileAccess/index.js";

const log = createLogger("API:Server");

export function registerQuickSetupRoutes(router) {
  router.post("/quick-setup", async (req, res) => {
    try {
      const fileAccess = new LocalFiles();
      const {
        installPath,
        serverName,
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

      // Validate inputs
      if (!installPath || !serverName) {
        return res
          .status(400)
          .json({ error: "Missing required fields: installPath, serverName" });
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

      // Check if server files exist
      const startServerBat = path.join(installPath, "StartServer64.bat");
      const startServerSh = path.join(installPath, "start-server.sh");
      const javaFolder = path.join(installPath, "jre64");

      if (
        !(await fileAccess.exists(startServerBat)) &&
        !(await fileAccess.exists(startServerSh)) &&
        !(await fileAccess.exists(javaFolder))
      ) {
        return res.status(400).json({
          error:
            "Server files not found. Make sure the path contains Project Zomboid dedicated server files.",
        });
      }

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
      const safeAdminPassword = sanitizeForBatch(adminPassword);

      log.info(
        `Quick setup: Creating server config for ${serverName} using files from ${installPath}`,
      );

      // Update settings
      await setSetting("serverPath", installPath);
      await setSetting("serverName", serverName);
      await setSetting("minMemory", safeMinMemory);
      await setSetting("maxMemory", safeMaxMemory);
      await setSetting("serverPort", safeServerPort);
      await setSetting("useUpnp", useUpnp);

      if (zomboidDataPath) {
        await setSetting("zomboidDataPath", zomboidDataPath);
      } else {
        await setSetting("zomboidDataPath", zomboidPath);
        log.info(
          `Using ${usesEnvironmentDataPath ? "configured" : "isolated"} data folder: ${zomboidPath}`,
        );
      }

      await setSetting("serverConfigPath", serverConfigPath);

      // Re-check immediately before creating configuration files in case the
      // selected mount changed during setup.
      try {
        ensureWritableDirectory(serverConfigPath);
      } catch (dirError) {
        log.error(
          `Data folder is not writable: ${zomboidPath} (${dirError.message})`,
        );
        throw new Error(
          `Server files found, but the data folder is not writable: ${zomboidPath} (${dirError.code || dirError.message}). ` +
            `Create it with the correct owner before starting the server, e.g. on Linux: ` +
            `sudo install -d -m 0755 -o "$(whoami)" -g "$(whoami)" "${zomboidPath}", then retry.`,
        );
      }

      // Save RCON settings
      if (rconPassword) {
        await setSetting("rconPassword", rconPassword);
        await setSetting("rconPort", safeRconPort);
        await setSetting("rconHost", "127.0.0.1");

        precreateRconIni(serverConfigPath, serverName, rconPassword, safeRconPort);
      }

      // Generate custom startup scripts
      const scripts = await generateStartupScripts({
        installPath,
        serverName,
        minMemory: safeMinMemory,
        maxMemory: safeMaxMemory,
        zomboidDataPath: zomboidPath,
        adminPassword: safeAdminPassword,
        serverPort: safeServerPort,
        useNoSteam,
        useDebug,
      });

      const { batchPath, shellPath } = writeStartupScriptFiles(
        installPath,
        serverName,
        scripts,
      );
      log.info(`Created custom startup batch: ${batchPath}`);
      log.info(`Created custom startup script: ${shellPath}`);

      const startupScript =
        process.platform === "win32"
          ? `StartServer_${serverName}.bat`
          : `start-server_${serverName}.sh`;

      // Auto-install PanelBridge mod to the server
      const panelBridgeInstalled = installPanelBridgeMod(installPath);

      await logServerEvent(
        "server_quick_setup",
        `Created server config for ${serverName} using existing files at ${installPath}`,
      );

      res.json({
        success: true,
        message: "Server configuration created successfully",
        installPath,
        serverName,
        zomboidDataPath: zomboidPath, // Send back the computed data path
        serverConfigPath,
        batchFile: startupScript,
        rconPort: safeRconPort,
        hasRconPassword: !!rconPassword,
        serverPort: safeServerPort,
        minMemory: safeMinMemory,
        maxMemory: safeMaxMemory,
        panelBridgeInstalled,
      });
    } catch (error) {
      log.error(`Quick setup error: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}
