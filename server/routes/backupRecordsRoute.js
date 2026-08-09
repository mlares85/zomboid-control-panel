import express from "express";
import path from "path";
import fs from "fs";
import { createLogger } from "../utils/logger.js";
import { sanitizeError } from "../utils/sanitize.js";
import { listRecords, getRecord, updateRecord } from "../services/backupRecords.js";
import { computeChecksum, verifyArchive } from "../utils/backupCompression.js";

const log = createLogger("API:Backup:Records");
const router = express.Router();

router.get("/records", async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
    const records = await listRecords(Number.isFinite(limit) ? limit : undefined);
    res.json({ records });
  } catch (error) {
    log.error(`Failed to list backup records: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/verify/:id", async (req, res) => {
  try {
    const record = await getRecord(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "Backup record not found" });
    if (!record.fileName) {
      return res.json({ success: true, verified: false, readable: false, checksumMatches: false, message: "No local file recorded for this backup." });
    }

    const backupService = req.app.get("backupService");
    const backupsPath = await backupService.getBackupsPath();
    const filePath = path.join(backupsPath, record.fileName);

    if (!fs.existsSync(filePath)) {
      await updateRecord(record.id, { verified: false });
      return res.json({
        success: true,
        verified: false,
        readable: false,
        checksumMatches: false,
        message: "Backup file not found locally — it may only exist at a remote destination.",
      });
    }

    const [checksum, archiveResult] = await Promise.all([
      computeChecksum(filePath),
      verifyArchive(record.format, filePath),
    ]);
    const checksumMatches = checksum === record.checksum;
    const verified = checksumMatches && archiveResult.readable;
    await updateRecord(record.id, { verified });

    res.json({
      success: true,
      verified,
      readable: archiveResult.readable,
      checksumMatches,
      message: verified
        ? "Backup verified: checksum matches and archive is readable."
        : `Verification failed${!checksumMatches ? " (checksum mismatch)" : ""}${!archiveResult.readable ? ` (archive unreadable: ${archiveResult.error})` : ""}.`,
    });
  } catch (error) {
    log.error(`Failed to verify backup ${req.params.id}: ${error.message}`);
    res.status(500).json({ success: false, error: sanitizeError(error.message) });
  }
});

export default router;
