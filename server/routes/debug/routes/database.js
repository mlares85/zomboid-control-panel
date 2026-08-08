import express from "express";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import {
  compactDatabase,
  createDatabaseBackup,
  getDatabaseStats,
} from "../../../database/init.js";

const log = createLogger("API:Debug");
const router = express.Router();

// Database stats
router.get("/database", async (req, res) => {
  try {
    const stats = await getDatabaseStats();
    res.json(stats);
  } catch (error) {
    log.error(`Failed to get database stats: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Create manual database backup
router.post("/database/backup", async (req, res) => {
  try {
    log.info("POST /database/backup");
    const result = await createDatabaseBackup();
    res.json(result);
  } catch (error) {
    log.error(`Failed to create database backup: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Compact database (apply retention policies)
router.post("/database/compact", async (req, res) => {
  try {
    log.info("POST /database/compact");
    const result = await compactDatabase();
    res.json(result);
  } catch (error) {
    log.error(`Failed to compact database: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
