import express from "express";
import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { requireRole } from "../../services/auth.js";
import { parseIni, scanForPzPaths } from "./scanHelpers.js";

const log = createLogger("API:Servers");
const router = express.Router();

// Auto-scan a folder to find PZ server install paths and data paths
router.post("/auto-scan", requireRole("admin"), async (req, res) => {
  try {
    const { scanPath, maxDepth = 3 } = req.body;

    if (!scanPath) {
      return res.status(400).json({ error: "Scan path is required" });
    }

    // Validate scanPath - must be an absolute path
    if (typeof scanPath !== "string" || scanPath.length > 500) {
      return res.status(400).json({ error: "Invalid path format" });
    }

    const resolvedPath = path.resolve(scanPath);

    // Must be an absolute path
    if (!path.isAbsolute(resolvedPath)) {
      return res.status(400).json({ error: "Must be an absolute path" });
    }

    // Block scanning root paths directly — require at least one subfolder
    const isRootPath =
      process.platform === "win32"
        ? /^[A-Za-z]:[\\/]?$/.test(resolvedPath)
        : resolvedPath === "/";
    if (isRootPath) {
      return res
        .status(400)
        .json({
          error: "Cannot scan a root path. Please specify a subfolder.",
        });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(400).json({ error: "Path does not exist" });
    }

    log.info(`Auto-scanning for PZ servers in: ${resolvedPath}`);

    const clampedDepth = Math.min(Math.max(parseInt(maxDepth, 10) || 3, 1), 3);
    const results = scanForPzPaths(resolvedPath, clampedDepth);

    // For each data path, detect the server configs
    const detectedConfigs = [];
    for (const dataPath of results.dataPaths) {
      const serverConfigPath = path.join(dataPath, "Server");
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

          // Try to find a matching custom bat file for this server
          const matchingBat = results.customBatFiles.find(
            (bat) =>
              serverName.toLowerCase().includes(bat.serverName.toLowerCase()) ||
              bat.serverName.toLowerCase().includes(serverName.toLowerCase()),
          );

          detectedConfigs.push({
            dataPath,
            serverConfigPath,
            serverName,
            iniFile,
            rconPort: parseInt(settings.RCONPort, 10) || 27015,
            rconPassword: settings.RCONPassword || "",
            serverPort: parseInt(settings.DefaultPort, 10) || 16261,
            publicName: settings.PublicName || serverName,
            hasRcon: !!settings.RCONPassword,
            // New: matched bat file info
            matchedBatFile: matchingBat ? matchingBat.path : null,
            matchedInstallPath: matchingBat ? matchingBat.folder : null,
          });
        } catch (err) {
          log.warn(`Failed to parse ${iniFile}: ${err.message}`);
        }
      }
    }

    log.info(
      `Found ${results.installPaths.length} install paths, ${results.dataPaths.length} data paths, ${detectedConfigs.length} server configs, ${results.customBatFiles.length} custom bat files`,
    );

    res.json({
      scanPath,
      installPaths: results.installPaths,
      dataPaths: results.dataPaths,
      customBatFiles: results.customBatFiles,
      detectedConfigs,
    });
  } catch (error) {
    log.error(`Failed to auto-scan: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
