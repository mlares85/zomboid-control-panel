import express from "express";
import fs from "fs";
import path from "path";
import { getResolutionState, invalidateResolutionCache } from "./b42Resolution.js";
import { TILE_CACHE_DIR } from "./tileCache.js";

const router = express.Router();

// GET /settings — current map version checker status + cache info
router.get("/settings", async (req, res) => {
  const checker = req.app.get("mapVersionChecker");
  const resolution = getResolutionState();
  const cacheStats = await getCacheStats();

  res.json({
    checker: checker ? checker.getStatus() : null,
    resolution,
    cache: cacheStats,
  });
});

// PUT /settings/check-interval — update how often we check for new map builds
router.put("/settings/check-interval", async (req, res) => {
  const checker = req.app.get("mapVersionChecker");
  if (!checker) {
    return res.status(503).json({ success: false, error: "Map version checker not available" });
  }

  const { hours } = req.body;
  if (typeof hours !== "number" || hours < 1 || hours > 168) {
    return res.status(400).json({
      success: false,
      error: "hours must be a number between 1 and 168 (1 hour to 7 days)",
    });
  }

  const ms = Math.round(hours * 3600000);
  const actualMs = await checker.setInterval(ms);
  res.json({ success: true, intervalHours: actualMs / 3600000 });
});

// POST /settings/check-now — force an immediate version check
router.post("/settings/check-now", async (req, res) => {
  const checker = req.app.get("mapVersionChecker");
  if (!checker) {
    return res.status(503).json({ success: false, error: "Map version checker not available" });
  }

  invalidateResolutionCache();
  const result = await checker.checkNow();
  res.json({ success: true, ...result });
});

// Lightweight cache stats — count files and total size without reading file contents.
async function getCacheStats() {
  try {
    const stats = { directories: 0, files: 0, totalBytes: 0 };
    await walkDir(TILE_CACHE_DIR, stats);
    return stats;
  } catch {
    return { directories: 0, files: 0, totalBytes: 0 };
  }
}

async function walkDir(dir, stats) {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      stats.directories++;
      await walkDir(path.join(dir, entry.name), stats);
    } else if (entry.isFile()) {
      stats.files++;
      try {
        const st = await fs.promises.stat(path.join(dir, entry.name));
        stats.totalBytes += st.size;
      } catch {
        // stat failure — skip size, still count the file
      }
    }
  }
}

export default router;
