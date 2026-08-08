import express from "express";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import {
  getBridgeLogs,
  getCommandHistory,
  getDb,
  getPlayerLogs,
} from "../../../database/init.js";

const log = createLogger("API:Debug");
const router = express.Router();

// ============================================
// Unified Activity Log
// ============================================

// GET /api/debug/activity — Merge all log sources into a single chronological feed
router.get("/activity", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const source = req.query.source || "all"; // 'all' | 'rcon' | 'bridge' | 'player' | 'server'

    const entries = [];

    // RCON command history
    if (source === "all" || source === "rcon") {
      const rconHistory = await getCommandHistory(limit);
      for (const cmd of rconHistory) {
        entries.push({
          id: cmd.id,
          source: "rcon",
          action: cmd.command,
          detail: cmd.response || "",
          success: cmd.success === 1,
          timestamp: cmd.executed_at,
        });
      }
    }

    // Bridge command history
    if (source === "all" || source === "bridge") {
      const bridgeHistory = await getBridgeLogs(limit);
      for (const cmd of bridgeHistory) {
        const detail =
          cmd.success === 1
            ? cmd.result?.data
              ? JSON.stringify(cmd.result.data).substring(0, 300)
              : "ok"
            : cmd.result?.error || "failed";
        entries.push({
          id: cmd.id,
          source: "bridge",
          action: cmd.action,
          args: cmd.args,
          detail,
          success: cmd.success === 1,
          duration_ms: cmd.duration_ms,
          timestamp: cmd.executed_at,
        });
      }
    }

    // Player action logs
    if (source === "all" || source === "player") {
      const playerLogs = await getPlayerLogs(null, limit);
      for (const log of playerLogs) {
        entries.push({
          id: log.id,
          source: "player",
          action: log.action,
          detail: log.player_name + (log.details ? ` — ${log.details}` : ""),
          success: true,
          timestamp: log.logged_at,
        });
      }
    }

    // Server events
    if (source === "all" || source === "server") {
      const db = await getDb();
      const serverEvents = (db.data.server_events || []).slice(0, limit);
      for (const evt of serverEvents) {
        entries.push({
          id: evt.id,
          source: "server",
          action: evt.event_type,
          detail: evt.message || "",
          success: !/(crash|error|fail)/i.test(evt.event_type),
          timestamp: evt.created_at,
        });
      }
    }

    // Sort by timestamp (newest first) and trim
    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const trimmed = entries.slice(0, limit);

    res.json({ entries: trimmed, total: trimmed.length });
  } catch (error) {
    log.error(`Activity log failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
