import { createLogger } from "../utils/logger.js";
import { sanitizeError } from "../utils/sanitize.js";
import { getActiveServer } from "../database/init.js";
import { createEnhancedBackup } from "../services/backupOrchestrator.js";

const log = createLogger("API:Backup");

// `format`/`type`/`destinations` opt into the enhanced pipeline (compression
// format choice, incremental backups, multi-destination upload). Omitting
// all three preserves the original zip-to-local behavior exactly, including
// includeDb support.
function usesEnhancedOptions(body) {
  return body?.format !== undefined || body?.type !== undefined || body?.destinations !== undefined;
}

export async function handleCreateBackup(req, res) {
  try {
    log.info("POST /create — creating manual backup");
    const activeServer = await getActiveServer();
    if (activeServer?.isRemote) {
      return res.status(400).json({
        error: "Backups are not available for remote servers. The server filesystem is not accessible from this panel.",
      });
    }

    const backupService = req.app.get("backupService");
    const io = req.app.get("io");
    const rconService = req.app.get("rconService");

    const result = usesEnhancedOptions(req.body)
      ? await createEnhancedBackup(backupService, { ...req.body, io, rconService })
      : await backupService.createBackup({ ...req.body, io });

    if (result.success) {
      io?.emit("backup:changed", { action: "create" });
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    log.error(`Failed to create backup: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
}
