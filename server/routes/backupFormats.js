import express from "express";
import { createLogger } from "../utils/logger.js";
import { sanitizeError } from "../utils/sanitize.js";
import { listFormats } from "../utils/backupCompression.js";
import { compareFormatsOnSample } from "../utils/backupFormatCompare.js";

const log = createLogger("API:Backup");
const router = express.Router();

router.get("/formats", (req, res) => {
  res.json({ formats: listFormats() });
});

router.get("/compare-formats", async (req, res) => {
  try {
    const backupService = req.app.get("backupService");
    const savesPath = await backupService.getSavesPath();
    const result = await compareFormatsOnSample(savesPath);
    res.json(result);
  } catch (error) {
    log.error(`Failed to compare backup formats: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
