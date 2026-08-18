import path from "path";
import { createLogger } from "../utils/logger.js";
import { sanitizeError } from "../utils/sanitize.js";
import { getActiveServer } from "../database/init.js";
import { LocalFiles } from "../services/fileAccess/index.js";

const log = createLogger("API:Backup");

// 4 GB ceiling — matches the express.raw() limit configured on the route.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;

// Upload a backup .zip from the user's machine into the backups folder.
// The body is the raw zip bytes; the filename is read from the
// X-Backup-Filename header. The stored filename is prefixed with
// "uploaded-" so external archives are visually separated from the
// panel's own scheduled backups, and never collide with them when the
// auto-prune logic looks for the oldest panel-created backup to drop.
export async function handleUploadBackup(req, res) {
  try {
    const fileAccess = new LocalFiles();
    const activeServer = await getActiveServer();
    if (activeServer?.isRemote) {
      return res
        .status(400)
        .json({ error: "Backup upload is not available for remote servers." });
    }

    if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({
        error:
          "No file uploaded. Send the zip body with Content-Type: application/zip.",
      });
    }

    // Quick sanity check: zip files start with the local-file-header
    // signature 0x504B0304 ("PK\x03\x04"). Catches accidental uploads
    // of completely different file types early.
    if (req.body.length < 4 || req.body[0] !== 0x50 || req.body[1] !== 0x4b) {
      return res
        .status(400)
        .json({ error: "File does not look like a valid .zip archive." });
    }

    const rawName = String(
      req.headers["x-backup-filename"] || "uploaded-backup.zip",
    );
    // Strip any path components and limit to filesystem-safe characters.
    // path.basename() handles both / and \ separators on all platforms.
    const baseName = path
      .basename(rawName)
      .replace(/[^A-Za-z0-9_.\- ]/g, "_")
      .slice(0, 200);
    if (!baseName.toLowerCase().endsWith(".zip")) {
      return res.status(400).json({ error: "Only .zip backups are accepted." });
    }

    const backupService = req.app.get("backupService");
    const backupsPath = await backupService.getBackupsPath();
    if (!backupsPath) {
      return res.status(500).json({
        error: "Backups folder not available. Configure the server first.",
      });
    }
    if (!(await fileAccess.exists(backupsPath))) {
      await fileAccess.mkdir(backupsPath, { recursive: true });
    }

    // Always prefix to distinguish from auto-named backups (world_backup_*).
    const finalName = baseName.startsWith("uploaded-")
      ? baseName
      : `uploaded-${baseName}`;
    const targetPath = path.join(backupsPath, finalName);

    // Refuse silent overwrite — a user would lose the previous upload.
    if (await fileAccess.exists(targetPath)) {
      return res.status(409).json({
        error: `A backup named "${finalName}" already exists. Delete it first or rename the upload.`,
      });
    }

    // Atomic write: write to .tmp first, then rename. A crash during
    // upload won't leave a half-written .zip in the listing.
    const tmpPath = `${targetPath}.tmp`;
    const writeResult = await fileAccess.writeFile(tmpPath, req.body);
    if (!writeResult.success) {
      return res
        .status(500)
        .json({ error: `Failed to save upload: ${writeResult.error}` });
    }
    const renameResult = await fileAccess.rename(tmpPath, targetPath);
    if (!renameResult.success) {
      return res
        .status(500)
        .json({ error: `Failed to finalize upload: ${renameResult.error}` });
    }

    log.info(`POST /upload — stored ${finalName} (${req.body.length} bytes)`);
    res.json({
      success: true,
      name: finalName,
      size: req.body.length,
      message: `Uploaded backup saved as ${finalName}. Use Restore to apply it.`,
    });
  } catch (error) {
    log.error(`Failed to upload backup: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
}
