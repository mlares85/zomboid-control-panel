// Server console log (server-console.txt): tail read + error counting.
// Streaming/clearing live in consoleStream.js; noise filtering in
// consoleFilters.js — split out to keep every file under the line limit.
import path from "path";
import fs from "fs";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { resolveZomboidDataPath } from "./consoleShared.js";
import { filterConsoleLogLines, CONSOLE_LOG_ERROR_PATTERNS } from "./consoleFilters.js";
import { registerConsoleStreamRoutes } from "./consoleStream.js";

const log = createLogger("API:Server");

// How many errors the game has thrown, so the dashboard can stop being calm
// while the server is screaming. Counted from the most recent "SERVER STARTED"
// marker when one is present in the sampled tail, otherwise across the sample.
let errorCountCache = { at: 0, value: null };
const ERROR_COUNT_TTL_MS = 20000;

export function registerConsoleRoutes(router) {
  registerConsoleLogRoute(router);
  registerErrorCountRoute(router);
  registerConsoleStreamRoutes(router);
}

function registerConsoleLogRoute(router) {
  // Get server console log content
  router.get("/console-log", async (req, res) => {
    try {
      const zomboidDataPath = await resolveZomboidDataPath();

      if (!zomboidDataPath) {
        return res.status(400).json({ error: "Server data path not configured" });
      }

      const consoleLogPath = path.join(zomboidDataPath, "server-console.txt");

      if (!fs.existsSync(consoleLogPath)) {
        return res.json({
          success: true,
          content: "",
          lines: [],
          exists: false,
          path: consoleLogPath,
        });
      }

      // Filter level: 'all' | 'filtered' | 'important' | 'errors'
      const filterLevel = req.query.filter || "filtered";

      // Read last N lines (default 500, max 2000)
      const maxLines = Math.min(parseInt(req.query.lines, 10) || 500, 2000);

      // Read only the tail of the file to prevent DoS with large log files
      const stats = fs.statSync(consoleLogPath);
      const MAX_READ_BYTES = 5 * 1024 * 1024; // 5MB cap
      let content;
      if (stats.size > MAX_READ_BYTES) {
        const fd = fs.openSync(consoleLogPath, "r");
        const readStart = stats.size - MAX_READ_BYTES;
        const buffer = Buffer.alloc(MAX_READ_BYTES);
        try {
          fs.readSync(fd, buffer, 0, MAX_READ_BYTES, readStart);
        } finally {
          try {
            fs.closeSync(fd);
          } catch (_) {
            /* ignore */
          }
        }
        // Skip first partial line after seeking
        const raw = buffer.toString("utf-8");
        const firstNewline = raw.indexOf("\n");
        content = firstNewline >= 0 ? raw.slice(firstNewline + 1) : raw;
      } else {
        content = fs.readFileSync(consoleLogPath, "utf-8");
      }
      const allLines = content.split("\n");

      // Apply filtering
      const filteredLines = filterConsoleLogLines(allLines, filterLevel);
      const lines = filteredLines.slice(-maxLines);

      res.json({
        success: true,
        content: lines.join("\n"),
        lines,
        totalLines: allLines.length,
        filteredCount: filteredLines.length,
        filterLevel,
        exists: true,
        path: consoleLogPath,
        lastModified: stats.mtime.toISOString(),
        size: stats.size,
      });
    } catch (error) {
      log.error(`Failed to read server console log: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}

function registerErrorCountRoute(router) {
  router.get("/console-log/error-count", async (req, res) => {
    try {
      const now = Date.now();
      if (errorCountCache.value && now - errorCountCache.at < ERROR_COUNT_TTL_MS) {
        return res.json(errorCountCache.value);
      }

      const zomboidDataPath = await resolveZomboidDataPath();

      if (!zomboidDataPath) {
        return res.json({ exists: false, count: 0, sinceStart: false });
      }

      const consoleLogPath = path.join(zomboidDataPath, "server-console.txt");
      if (!fs.existsSync(consoleLogPath)) {
        return res.json({ exists: false, count: 0, sinceStart: false });
      }

      // Only ever read the tail. This endpoint is polled, so it must stay cheap
      // no matter how large the log has grown.
      const MAX_READ_BYTES = 2 * 1024 * 1024;
      const stats = fs.statSync(consoleLogPath);
      let content;
      let truncated = false;
      if (stats.size > MAX_READ_BYTES) {
        truncated = true;
        const fd = fs.openSync(consoleLogPath, "r");
        const buffer = Buffer.alloc(MAX_READ_BYTES);
        try {
          fs.readSync(fd, buffer, 0, MAX_READ_BYTES, stats.size - MAX_READ_BYTES);
        } finally {
          try {
            fs.closeSync(fd);
          } catch (_) {
            /* ignore */
          }
        }
        const raw = buffer.toString("utf-8");
        const firstNewline = raw.indexOf("\n");
        content = firstNewline >= 0 ? raw.slice(firstNewline + 1) : raw;
      } else {
        content = fs.readFileSync(consoleLogPath, "utf-8");
      }

      const lines = content.split("\n");
      let startIndex = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (/SERVER STARTED/.test(lines[i])) {
          startIndex = i;
          break;
        }
      }
      const scanned = startIndex >= 0 ? lines.slice(startIndex) : lines;
      const count = scanned.filter((line) =>
        CONSOLE_LOG_ERROR_PATTERNS.some((pattern) => pattern.test(line)),
      ).length;

      const payload = {
        exists: true,
        count,
        sinceStart: startIndex >= 0,
        truncated,
        lastModified: stats.mtime.toISOString(),
      };
      errorCountCache = { at: now, value: payload };
      res.json(payload);
    } catch (error) {
      log.error(`Failed to count console log errors: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}
