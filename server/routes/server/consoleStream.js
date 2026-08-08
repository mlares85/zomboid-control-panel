// Long-poll tail streaming and clearing of server-console.txt.
import path from "path";
import fs from "fs";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { resolveZomboidDataPath } from "./consoleShared.js";
import { filterConsoleLogLines } from "./consoleFilters.js";

const log = createLogger("API:Server");

export function registerConsoleStreamRoutes(router) {
  registerConsoleStreamRoute(router);
  registerConsoleClearRoute(router);
}

function registerConsoleStreamRoute(router) {
  // Stream server console log (long-polling for new content)
  router.get("/console-log/stream", async (req, res) => {
    try {
      const zomboidDataPath = await resolveZomboidDataPath();

      if (!zomboidDataPath) {
        return res.status(400).json({
          error: "Server data path not configured",
          detail: "Set the Zomboid data path in Servers > Edit.",
          fixUrl: "/servers",
        });
      }

      const consoleLogPath = path.join(zomboidDataPath, "server-console.txt");

      if (!fs.existsSync(consoleLogPath)) {
        return res.json({ success: true, newLines: [], exists: false });
      }

      // Filter level: 'all' | 'filtered' | 'important' | 'errors'
      const filterLevel = req.query.filter || "filtered";

      // Get the last known position from client
      const lastSize = Math.max(0, parseInt(req.query.lastSize, 10) || 0);
      const stats = fs.statSync(consoleLogPath);

      // If file is smaller than last known size, it was likely rotated/cleared
      if (stats.size < lastSize) {
        const content = fs.readFileSync(consoleLogPath, "utf-8");
        const allLines = content.split("\n").filter((l) => l.trim());
        const lines = filterConsoleLogLines(allLines, filterLevel);
        return res.json({
          success: true,
          newLines: lines,
          currentSize: stats.size,
          rotated: true,
          filterLevel,
          lastModified: stats.mtime.toISOString(),
        });
      }

      // If no new content, return empty
      if (stats.size === lastSize) {
        return res.json({
          success: true,
          newLines: [],
          currentSize: stats.size,
          filterLevel,
          lastModified: stats.mtime.toISOString(),
        });
      }

      // Read only new content from the last known position
      const fd = fs.openSync(consoleLogPath, "r");
      const newBytes = stats.size - lastSize;
      const buffer = Buffer.alloc(newBytes);
      try {
        fs.readSync(fd, buffer, 0, newBytes, lastSize);
      } finally {
        try {
          fs.closeSync(fd);
        } catch (_) {
          /* ignore */
        }
      }

      const newContent = buffer.toString("utf-8");
      const allNewLines = newContent.split("\n").filter((l) => l.trim());
      const newLines = filterConsoleLogLines(allNewLines, filterLevel);

      res.json({
        success: true,
        newLines,
        currentSize: stats.size,
        filterLevel,
        lastModified: stats.mtime.toISOString(),
      });
    } catch (error) {
      log.error(`Failed to stream server console log: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}

function registerConsoleClearRoute(router) {
  // Clear server console log
  router.post("/console-log/clear", async (req, res) => {
    try {
      const zomboidDataPath = await resolveZomboidDataPath();

      if (!zomboidDataPath) {
        return res.status(400).json({
          error: "Server data path not configured",
          detail: "Set the Zomboid data path in Servers > Edit.",
          fixUrl: "/servers",
        });
      }

      const consoleLogPath = path.join(zomboidDataPath, "server-console.txt");

      if (fs.existsSync(consoleLogPath)) {
        fs.writeFileSync(consoleLogPath, "");
        log.info("Server console log cleared");
      }

      res.json({ success: true });
    } catch (error) {
      log.error(`Failed to clear server console log: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}
