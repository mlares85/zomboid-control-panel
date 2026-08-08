import express from "express";
import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { parseIni } from "./scanHelpers.js";

const log = createLogger("API:Servers");
const router = express.Router();

// Detect server settings from data path (folder containing Server/, Saves/, Logs/)
router.post("/detect", async (req, res) => {
  try {
    const { dataPath, installPath } = req.body;
    log.info(
      `POST /detect: dataPath=${dataPath}, installPath=${installPath || "auto"}`,
    );

    if (!dataPath) {
      return res.status(400).json({ error: "Data path is required" });
    }

    // Validate path format
    if (typeof dataPath !== "string" || dataPath.length > 500) {
      return res.status(400).json({ error: "Invalid path format" });
    }

    // Must be absolute
    const resolvedData = path.resolve(dataPath);
    if (!path.isAbsolute(resolvedData)) {
      return res.status(400).json({ error: "Must be an absolute path" });
    }

    // Verify data path exists
    if (!fs.existsSync(resolvedData)) {
      return res.status(400).json({ error: "Data path does not exist" });
    }

    // Check if this is a valid Zomboid data folder (should have Server subfolder)
    const serverConfigPath = path.join(resolvedData, "Server");
    if (!fs.existsSync(serverConfigPath)) {
      return res
        .status(400)
        .json({
          error: "Not a valid Zomboid data folder (no Server subfolder found)",
        });
    }

    // Validate installPath if provided
    let resolvedInstall = null;
    let hasNoSteam = false;
    let validInstallPath = false;
    if (installPath) {
      if (typeof installPath !== "string" || installPath.length > 500) {
        return res.status(400).json({ error: "Invalid install path format" });
      }
      resolvedInstall = path.resolve(installPath);
      if (fs.existsSync(resolvedInstall)) {
        const startBat = path.join(resolvedInstall, "StartServer64.bat");
        const startBatNoSteam = path.join(
          resolvedInstall,
          "StartServer64_nosteam.bat",
        );
        const startSh = path.join(resolvedInstall, "start-server.sh");
        validInstallPath =
          fs.existsSync(startBat) ||
          fs.existsSync(startBatNoSteam) ||
          fs.existsSync(startSh);
        hasNoSteam = fs.existsSync(startBatNoSteam);
      }
    }

    // Find server INI files
    const detectedServers = [];

    if (fs.existsSync(serverConfigPath)) {
      const files = fs.readdirSync(serverConfigPath);
      // Filter for server .ini files (exclude _SandboxVars, _spawnpoints, _spawnregions)
      const iniFiles = files.filter(
        (f) =>
          f.endsWith(".ini") &&
          !f.endsWith("_SandboxVars.ini") &&
          !f.endsWith("_spawnpoints.ini") &&
          !f.endsWith("_spawnregions.ini"),
      );

      for (const iniFile of iniFiles) {
        const serverName = iniFile.replace(".ini", "");
        const iniPath = path.join(serverConfigPath, iniFile);

        try {
          const content = fs
            .readFileSync(iniPath, "utf-8")
            .replace(/\r\n/g, "\n");
          const settings = parseIni(content);

          detectedServers.push({
            serverName,
            iniFile,
            rconPort: parseInt(settings.RCONPort, 10) || 27015,
            rconPassword: settings.RCONPassword || "",
            serverPort: parseInt(settings.DefaultPort, 10) || 16261,
            publicName: settings.PublicName || serverName,
            hasRcon: !!settings.RCONPassword,
          });
        } catch (err) {
          log.warn(`Failed to parse ${iniFile}: ${err.message}`);
        }
      }
    }

    res.json({
      valid: true,
      dataPath: resolvedData,
      serverConfigPath,
      installPath: resolvedInstall || "",
      validInstallPath,
      hasNoSteam,
      detectedServers,
    });
  } catch (error) {
    log.error(`Failed to detect server: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
