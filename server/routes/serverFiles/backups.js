import express from "express";
import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Files");
import { sanitizeError } from "../../utils/sanitize.js";
import { getServerConfigPath, getBackupPath, createBackup } from "./context.js";

const router = express.Router();

// List backups
router.get("/backups", async (req, res) => {
  try {
    const fileAccess = req.fileAccess;
    const backupDir = await getBackupPath();

    if (!(await fileAccess.exists(backupDir))) {
      return res.json({ backups: [] });
    }

    const fileList = await fileAccess.readdir(backupDir);
    const files = (
      await Promise.all(
        fileList
          .filter((f) => f.endsWith(".bak"))
          .map(async (filename) => {
            try {
              const stats = await fs.promises.stat(
                path.join(backupDir, filename),
              );
              return {
                filename,
                size: stats.size,
                created: stats.birthtime,
              };
            } catch (e) {
              log.debug(
                `Stat failed for backup file ${filename}: ${e.message}`,
              );
              return null;
            }
          }),
      )
    )
      .filter((f) => f !== null)
      .sort((a, b) => {
        // Handle invalid dates gracefully
        const dateA = new Date(a.created);
        const dateB = new Date(b.created);
        if (isNaN(dateA.getTime())) return 1;
        if (isNaN(dateB.getTime())) return -1;
        return dateB - dateA;
      });

    res.json({ backups: files, path: backupDir });
  } catch (error) {
    log.error("Failed to list backups:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Restore from backup
router.post("/restore/:filename", async (req, res) => {
  try {
    const fileAccess = req.fileAccess;
    const backupDir = await getBackupPath();
    const configPath = await getServerConfigPath();

    // Sanitize filename to prevent path traversal
    const filename = path.basename(req.params.filename);
    log.info(`POST /restore: filename=${filename}`);

    if (!filename.endsWith(".bak")) {
      return res.status(400).json({ error: "Invalid backup file extension" });
    }

    const backupPath = path.join(backupDir, filename);

    if (!(await fileAccess.exists(backupPath))) {
      return res.status(404).json({ error: "Backup not found" });
    }

    // Extract original filename from backup name (e.g., "servertest.ini.2024-01-01T12-00-00.bak")
    const parts = filename.split(".");
    if (parts.length < 3) {
      return res.status(400).json({ error: "Invalid backup filename" });
    }

    // Get original filename (everything before the timestamp)
    const bakIndex = filename.lastIndexOf(".bak");
    const timestampStart = filename.lastIndexOf(".", bakIndex - 1);
    const originalName = filename.substring(0, timestampStart);

    const targetPath = path.join(configPath, originalName);

    // Create backup of current before restoring
    if (await fileAccess.exists(targetPath)) {
      await createBackup(originalName);
    }

    const copyResult = await fileAccess.copyFile(backupPath, targetPath);
    if (!copyResult.success) {
      throw new Error(copyResult.error);
    }

    log.info(`Restored from backup: ${filename} -> ${originalName}`);
    res.json({
      success: true,
      message: `Restored ${originalName} from backup`,
    });
  } catch (error) {
    log.error("Failed to restore backup:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Save and reload (calls RCON reloadoptions)
router.post("/save-and-reload", async (req, res) => {
  try {
    log.info("POST /save-and-reload");
    const rconService = req.app.get("rconService");

    if (!rconService || !rconService.isConnected()) {
      return res.status(400).json({
        error: "RCON not connected. Changes saved but not reloaded.",
        detail:
          "The server won't pick up these changes until it restarts or RCON reconnects. Check your RCON host, port, and password in Settings > RCON.",
        fixUrl: "/settings?tab=connection",
      });
    }

    const result = await rconService.reloadOptions();
    res.json({ success: true, message: "Options reloaded", result });
  } catch (error) {
    log.error("Failed to reload options:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
