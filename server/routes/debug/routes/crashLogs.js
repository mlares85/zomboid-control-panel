import express from "express";
import fs from "fs";
import path from "path";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError } from "../../../utils/sanitize.js";

const log = createLogger("API:Debug");
const router = express.Router();

// Get crash logs (hs_err files from Java crashes)
router.get("/crash-logs", async (req, res) => {
  try {
    const serverManager = req.app.get("serverManager");
    const serverPath = serverManager?.serverPath || "";

    // Look for crash logs in common locations
    const crashDirs = [
      serverPath,
      path.join(serverPath, "logs"),
      process.cwd(),
      path.join(process.cwd(), "logs"),
    ].filter(Boolean);

    const crashLogs = [];
    const seenFiles = new Set(); // Prevent duplicates

    for (const dir of crashDirs) {
      try {
        // Check dir exists
        try {
          await fs.promises.access(dir);
        } catch (e) {
          log.debug(`Crash log dir not accessible (${dir}): ${e.message}`);
          continue;
        }

        const files = await fs.promises.readdir(dir);

        await Promise.all(
          files.map(async (file) => {
            // Skip if already seen
            if (seenFiles.has(file)) return;

            // Match Java crash dumps and common crash log patterns
            if (
              file.startsWith("hs_err_pid") ||
              (file.includes("crash") && file.endsWith(".log")) ||
              (file.includes("error") && file.endsWith(".log"))
            ) {
              try {
                const filePath = path.join(dir, file);
                const stats = await fs.promises.stat(filePath);
                if (!seenFiles.has(file)) {
                  // Check again after await
                  seenFiles.add(file);
                  crashLogs.push({
                    name: file,
                    path: filePath,
                    size: stats.size,
                    modified: stats.mtime.toISOString(),
                  });
                }
              } catch (e) {
                log.debug(`Stat failed for crash log ${file}: ${e.message}`);
              }
            }
          }),
        );
      } catch (e) {
        log.debug(
          `Directory not accessible for crash logs: ${dir} — ${e.message}`,
        );
      }
    }

    // Sort by modified date, newest first
    crashLogs.sort((a, b) => new Date(b.modified) - new Date(a.modified));

    res.json({ crashLogs: crashLogs.slice(0, 20) });
  } catch (error) {
    log.error(`Failed to get crash logs: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Get crash log content
router.get("/crash-logs/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    const serverManager = req.app.get("serverManager");
    const serverPath = serverManager?.serverPath || "";

    // Security: prevent path traversal
    if (
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\")
    ) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const searchDirs = [
      serverPath,
      path.join(serverPath, "logs"),
      process.cwd(),
      path.join(process.cwd(), "logs"),
    ].filter(Boolean);

    for (const dir of searchDirs) {
      const filePath = path.join(dir, filename);
      try {
        await fs.promises.access(filePath);

        // Read only first 100KB using file handle to prevent OOM on large files
        const handle = await fs.promises.open(filePath, "r");
        try {
          const stats = await handle.stat();
          const readSize = Math.min(stats.size, 100000);
          const buffer = Buffer.alloc(readSize);

          await handle.read(buffer, 0, readSize, 0);
          const content = buffer.toString("utf-8");

          return res.json({
            content,
            truncated: stats.size > 100000,
            size: stats.size,
          });
        } finally {
          await handle.close();
        }
      } catch (e) {
        // File not found in this dir, try next
      }
    }

    res.status(404).json({ error: "Crash log not found" });
  } catch (error) {
    log.error(`Failed to read crash log: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
