import express from "express";
import { createLogger } from "../utils/logger.js";
import { sanitizeError } from "../utils/sanitize.js";
import { requireRole } from "../services/auth.js";
import { getActiveServer } from "../database/init.js";
import { previewCompaction, compactSave, DEFAULT_STALE_DAYS } from "../utils/saveCompaction.js";

const log = createLogger("API:Backup:Compaction");
const router = express.Router();

function parseStaleDays(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_STALE_DAYS;
  return Math.min(parsed, 3650);
}

router.post("/compact", async (req, res) => {
  try {
    const backupService = req.app.get("backupService");
    const savesPath = await backupService.getSavesPath();
    const activeServer = await getActiveServer();
    const preview = await previewCompaction(savesPath, parseStaleDays(req.body?.staleDays));

    res.json({
      success: true,
      saveName: activeServer?.serverName || null,
      totalSize: preview.totalSize,
      totalSizeFormatted: preview.totalSizeFormatted,
      staleSize: preview.staleSize,
      staleSizeFormatted: preview.staleSizeFormatted,
      staleChunkCount: preview.staleChunkCount,
      totalChunkCount: preview.totalChunkCount,
      estimatedSavingsPercent: preview.estimatedSavingsPercent,
    });
  } catch (error) {
    log.error(`Compaction preview failed: ${error.message}`);
    res.status(400).json({ success: false, error: sanitizeError(error.message) });
  }
});

router.post("/compact/apply", requireRole("admin"), async (req, res) => {
  try {
    const serverManager = req.app.get("serverManager");
    if (serverManager) {
      const running = await serverManager.checkServerRunning();
      if (running) {
        return res.status(400).json({
          success: false,
          error: "Stop the server before compacting the save — a running server holds chunk files open.",
        });
      }
    }

    const backupService = req.app.get("backupService");
    const savesPath = await backupService.getSavesPath();
    const backupsPath = await backupService.getBackupsPath();
    const result = await compactSave({
      savePath: savesPath,
      backupsPath,
      staleDays: parseStaleDays(req.body?.staleDays),
      createBackup: req.body?.createBackup !== false,
    });

    res.json(result);
  } catch (error) {
    log.error(`Compaction failed: ${error.message}`);
    res.status(400).json({ success: false, error: sanitizeError(error.message) });
  }
});

export default router;
