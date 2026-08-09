import express from "express";
import path from "path";
import fs from "fs";
import { createLogger } from "../utils/logger.js";
import { sanitizeError } from "../utils/sanitize.js";
import { listRecords, getRecord, updateRecord, listBackupServers } from "../services/backupRecords.js";
import { computeChecksum, verifyArchive } from "../utils/backupCompression.js";

const log = createLogger("API:Backup:Records");
const router = express.Router();

router.get("/records", async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
    const records = await listRecords({
      limit: Number.isFinite(limit) ? limit : undefined,
      serverId: req.query.serverId || undefined,
      serverName: req.query.serverName || undefined,
    });
    res.json({ records });
  } catch (error) {
    log.error(`Failed to list backup records: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Servers that have at least one backup record, for the History table's
// filter dropdown. Registered before "/records/:id" would be irrelevant here
// (different path segment), but kept alongside it for readability.
router.get("/servers", async (req, res) => {
  try {
    const servers = await listBackupServers();
    res.json({ servers });
  } catch (error) {
    log.error(`Failed to list backup servers: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Full backup record, including the serverSnapshot, for the detail panel.
router.get("/records/:id", async (req, res) => {
  try {
    const record = await getRecord(req.params.id);
    if (!record) return res.status(404).json({ error: "Backup record not found" });
    res.json({ record });
  } catch (error) {
    log.error(`Failed to get backup record ${req.params.id}: ${error.message}`);
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
