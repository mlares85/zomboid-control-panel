import express from "express";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Files");
import { sanitizeError } from "../../utils/sanitize.js";
import { withFileLock, writeFileAtomic } from "../../utils/fileWriteQueue.js";
import { getServerConfigPath, getServerName, createBackup } from "./context.js";
import { LocalFiles } from "../../services/fileAccess/index.js";

const router = express.Router();

// Get server file paths info
router.get("/paths", async (req, res) => {
  try {
    log.info("GET /paths");
    const fileAccess = new LocalFiles();
    const configPath = await getServerConfigPath();
    const serverName = await getServerName();

    const files = {
      ini: path.join(configPath, `${serverName}.ini`),
      sandbox: path.join(configPath, `${serverName}_SandboxVars.lua`),
      spawnpoints: path.join(configPath, `${serverName}_spawnpoints.lua`),
      spawnregions: path.join(configPath, `${serverName}_spawnregions.lua`),
    };

    const exists = {
      ini: await fileAccess.exists(files.ini),
      sandbox: await fileAccess.exists(files.sandbox),
      spawnpoints: await fileAccess.exists(files.spawnpoints),
      spawnregions: await fileAccess.exists(files.spawnregions),
    };

    res.json({ configPath, serverName, files, exists });
  } catch (error) {
    log.error("Failed to get paths:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Get raw file content
router.get("/raw/:type", async (req, res) => {
  log.info(`GET /raw/${req.params.type}`);
  try {
    const fileAccess = new LocalFiles();
    const configPath = await getServerConfigPath();
    const serverName = await getServerName();
    const type = req.params.type;

    const fileMap = {
      ini: `${serverName}.ini`,
      sandbox: `${serverName}_SandboxVars.lua`,
      spawnpoints: `${serverName}_spawnpoints.lua`,
      spawnregions: `${serverName}_spawnregions.lua`,
    };

    if (!fileMap[type]) {
      return res.status(400).json({ error: "Invalid file type" });
    }

    const filePath = path.join(configPath, fileMap[type]);

    if (!(await fileAccess.exists(filePath))) {
      return res.status(404).json({ error: "File not found" });
    }

    const { success, data: content, error } = await fileAccess.readFile(filePath);
    if (!success) {
      return res.status(500).json({ error: sanitizeError(error) });
    }
    res.json({ content, filename: fileMap[type] });
  } catch (error) {
    log.error("Failed to read raw file:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Save raw file content
router.put("/raw/:type", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const configPath = await getServerConfigPath();
    const serverName = await getServerName();
    const type = req.params.type;
    const { content } = req.body;
    log.info(`PUT /raw/${type}: contentLength=${content?.length || 0}`);

    const fileMap = {
      ini: `${serverName}.ini`,
      sandbox: `${serverName}_SandboxVars.lua`,
      spawnpoints: `${serverName}_spawnpoints.lua`,
      spawnregions: `${serverName}_spawnregions.lua`,
    };

    if (!fileMap[type]) {
      return res.status(400).json({ error: "Invalid file type" });
    }

    if (typeof content !== "string") {
      return res.status(400).json({ error: "Content string required" });
    }

    if (content.length > 512 * 1024) {
      return res.status(400).json({ error: "Content too large (max 512KB)" });
    }

    const filePath = path.join(configPath, fileMap[type]);

    await withFileLock(filePath, async () => {
      if (await fileAccess.exists(filePath)) {
        await createBackup(fileMap[type]);
      }

      writeFileAtomic(filePath, content, "utf-8");
    });

    log.info(`Saved raw file: ${fileMap[type]}`);
    res.json({ success: true, message: "File saved" });
  } catch (error) {
    log.error("Failed to save raw file:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
