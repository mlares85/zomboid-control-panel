// Server .ini configuration writes (RCON, network) and update-checker status.
import path from "path";
import fs from "fs";
import { createLogger } from "../../utils/logger.js";
import { setSetting, getSetting, getActiveServer } from "../../database/init.js";
import { sanitizeError, sanitizeIniValue } from "../../utils/sanitize.js";
import { withFileLock, writeFileAtomic } from "../../utils/fileWriteQueue.js";
import { validateInt } from "./shared.js";

const log = createLogger("API:Server");

// Helper functions for multi-server support
async function getServerConfigPath() {
  const activeServer = await getActiveServer();
  if (activeServer?.serverConfigPath) {
    return activeServer.serverConfigPath;
  }
  const legacyPath = await getSetting("serverConfigPath");
  return legacyPath || null;
}

async function getServerName() {
  const activeServer = await getActiveServer();
  if (activeServer?.serverName) {
    return activeServer.serverName;
  }
  const legacyName = await getSetting("serverName");
  return legacyName || "servertest";
}

export function registerConfigRoutes(router) {
  registerConfigureRconRoute(router);
  registerConfigureNetworkRoute(router);
  registerUpdateCheckRoutes(router);
}

function registerConfigureRconRoute(router) {
  // Configure RCON in server's .ini file
  router.post("/configure-rcon", async (req, res) => {
    try {
      const { rconPassword, rconPort: rawRconPort = 27015 } = req.body;
      const rconPort = validateInt(rawRconPort, 1024, 65535, 27015);

      if (!rconPassword) {
        return res.status(400).json({ error: "RCON password is required" });
      }

      // Get the server config path from active server or settings
      const serverConfigPath = await getServerConfigPath();
      const serverName = await getServerName();

      if (!serverConfigPath) {
        return res.status(400).json({
          error: "Server config path not set. Please run installation first.",
        });
      }

      const iniPath = path.join(serverConfigPath, `${serverName}.ini`);

      if (!fs.existsSync(iniPath)) {
        return res.status(400).json({
          error: `Server config not found at ${iniPath}. Start the server once first to generate the config file.`,
        });
      }

      // Read and update the ini file. Locked per-path so this can't interleave
      // with ensureRconConfigured() or another config-save racing the same file.
      await withFileLock(iniPath, async () => {
        let content = fs.readFileSync(iniPath, "utf-8").replace(/\r\n/g, "\n");

        // Update RCONPassword (sanitize to prevent INI injection via newlines)
        const safePassword = sanitizeIniValue(rconPassword);
        if (content.includes("RCONPassword=")) {
          content = content.replace(
            /RCONPassword=.*/g,
            () => `RCONPassword=${safePassword}`,
          );
        } else {
          content += `\nRCONPassword=${safePassword}`;
        }

        // Update RCONPort
        if (content.includes("RCONPort=")) {
          content = content.replace(/RCONPort=.*/g, () => `RCONPort=${rconPort}`);
        } else {
          content += `\nRCONPort=${rconPort}`;
        }

        writeFileAtomic(iniPath, content, { encoding: "utf-8", mode: 0o600 });
      });

      // Also save to app settings
      await setSetting("rconPassword", rconPassword);
      await setSetting("rconPort", rconPort);
      await setSetting("rconHost", "127.0.0.1");

      log.info(`RCON configured in ${iniPath}`);
      res.json({
        success: true,
        message: `RCON configured successfully. Restart the server for changes to take effect.`,
        iniPath,
      });
    } catch (error) {
      log.error(`Failed to configure RCON: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}

function registerConfigureNetworkRoute(router) {
  // Configure server network settings (port, UPnP) in .ini file
  router.post("/configure-network", async (req, res) => {
    try {
      const { serverPort: rawServerPort = 16261, useUpnp = true } = req.body;
      const serverPort = validateInt(rawServerPort, 1024, 65535, 16261);

      // Get the server config path from active server or settings
      const serverConfigPath = await getServerConfigPath();
      const serverName = await getServerName();

      if (!serverConfigPath) {
        return res.status(400).json({
          error: "Server config path not set. Please run installation first.",
        });
      }

      const iniPath = path.join(serverConfigPath, `${serverName}.ini`);

      if (!fs.existsSync(iniPath)) {
        return res.status(400).json({
          error: `Server config not found at ${iniPath}. Start the server once first to generate the config file.`,
        });
      }

      // Read and update the ini file. Locked per-path for the same reason as
      // the RCON-config endpoint above.
      await withFileLock(iniPath, async () => {
        let content = fs.readFileSync(iniPath, "utf-8").replace(/\r\n/g, "\n");

        // Update DefaultPort
        if (content.includes("DefaultPort=")) {
          content = content.replace(
            /DefaultPort=.*/g,
            `DefaultPort=${serverPort}`,
          );
        } else {
          content += `\nDefaultPort=${serverPort}`;
        }

        // Update UDPPort (DefaultPort + 1)
        if (content.includes("UDPPort=")) {
          content = content.replace(/UDPPort=.*/g, `UDPPort=${serverPort + 1}`);
        } else {
          content += `\nUDPPort=${serverPort + 1}`;
        }

        // Update UPnP
        const upnpValue = useUpnp ? "true" : "false";
        if (content.includes("UPnP=")) {
          content = content.replace(/UPnP=.*/g, `UPnP=${upnpValue}`);
        } else {
          content += `\nUPnP=${upnpValue}`;
        }

        writeFileAtomic(iniPath, content, { encoding: "utf-8", mode: 0o600 });
      });

      // Also save to app settings
      await setSetting("serverPort", serverPort);
      await setSetting("useUpnp", useUpnp);

      log.info(
        `Network settings configured in ${iniPath}: port=${serverPort}, UPnP=${useUpnp ? "true" : "false"}`,
      );
      res.json({
        success: true,
        message: `Network settings configured successfully. Restart the server for changes to take effect.`,
        iniPath,
        settings: {
          defaultPort: serverPort,
          udpPort: serverPort + 1,
          upnp: useUpnp,
        },
      });
    } catch (error) {
      log.error(`Failed to configure network settings: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}

function registerUpdateCheckRoutes(router) {
  // Check for server updates
  router.get("/update-check", async (req, res) => {
    try {
      const updateChecker = req.app.get("updateChecker");
      if (!updateChecker) {
        return res.status(503).json({ error: "Update checker not available" });
      }

      const forceCheck = req.query.force === "true";

      if (forceCheck) {
        const result = await updateChecker.checkForUpdates(true);
        res.json(result || { error: "Could not check for updates" });
      } else {
        res.json(updateChecker.getStatus());
      }
    } catch (error) {
      log.error(`Update check failed: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  // Get update checker status
  router.get("/update-check/status", async (req, res) => {
    try {
      const updateChecker = req.app.get("updateChecker");
      if (!updateChecker) {
        return res.status(503).json({ error: "Update checker not available" });
      }

      res.json(updateChecker.getStatus());
    } catch (error) {
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  // Set update check interval
  router.post("/update-check/interval", async (req, res) => {
    try {
      const updateChecker = req.app.get("updateChecker");
      if (!updateChecker) {
        return res.status(503).json({ error: "Update checker not available" });
      }

      const { minutes } = req.body;
      if (!minutes || typeof minutes !== "number") {
        return res.status(400).json({ error: "minutes must be a number" });
      }

      await updateChecker.setInterval(minutes);
      res.json({ success: true, intervalMinutes: minutes });
    } catch (error) {
      log.error(`Failed to set update check interval: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}
