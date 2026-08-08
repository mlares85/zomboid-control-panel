import express from "express";
import { createLogger } from "../../../utils/logger.js";
import { setDataPaths } from "../../../utils/paths.js";
import { sanitizeError } from "../../../utils/sanitize.js";

const log = createLogger("API:Debug");
const router = express.Router();

// Update data paths (database and logs location)
router.post("/paths", async (req, res) => {
  try {
    const { dataDir, logsDir, moveFiles } = req.body;

    if (!dataDir && !logsDir) {
      return res
        .status(400)
        .json({ error: "At least one path must be provided" });
    }

    // Validate path format and length
    if (dataDir && (typeof dataDir !== "string" || dataDir.length > 500)) {
      return res.status(400).json({ error: "Invalid data directory path" });
    }
    if (logsDir && (typeof logsDir !== "string" || logsDir.length > 500)) {
      return res.status(400).json({ error: "Invalid logs directory path" });
    }

    const result = await setDataPaths(
      { dataDir, logsDir },
      moveFiles !== false,
    );

    if (result.success) {
      log.info(
        `Data paths updated - Data: ${result.paths.dataDir}, Logs: ${result.paths.logsDir}`,
      );
      res.json({
        success: true,
        message:
          "Paths updated successfully. Restart the application to apply changes.",
        paths: result.paths,
        filesMoved: result.filesMoved,
        requiresRestart: true,
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    log.error(`Failed to update paths: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
