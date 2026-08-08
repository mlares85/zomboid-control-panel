import express from "express";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import {
  getPerformanceHistory,
  recordPerformanceSnapshot,
} from "../../../database/init.js";

const log = createLogger("API:Debug");
const router = express.Router();

router.get("/performance-history", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 60;
    const history = await getPerformanceHistory(limit);
    res.json({ history });
  } catch (error) {
    log.error(`Failed to get performance history: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Record current performance snapshot (called periodically)
router.post("/performance-snapshot", async (req, res) => {
  try {
    const { memoryUsed, memoryTotal, cpuUsage, playerCount, serverRunning } =
      req.body || {};
    // Coerce + clamp each metric to a sane range. Unknown / missing values fall back to defaults.
    const toNum = (v, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
    await recordPerformanceSnapshot({
      memoryUsed: clamp(
        toNum(memoryUsed, process.memoryUsage().heapUsed),
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      memoryTotal: clamp(
        toNum(memoryTotal, process.memoryUsage().heapTotal),
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      cpuUsage: clamp(toNum(cpuUsage, 0), 0, 100),
      playerCount: clamp(Math.floor(toNum(playerCount, 0)), 0, 10_000),
      serverRunning: typeof serverRunning === "boolean" ? serverRunning : false,
    });
    res.json({ success: true });
  } catch (error) {
    log.error(`Failed to record performance snapshot: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
