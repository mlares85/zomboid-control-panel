// Delete server files (used when removing a server from panel with file deletion).
import path from "path";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { requireRole } from "../../services/auth.js";
import { isValidPath } from "./shared.js";
import { LocalFiles } from "../../services/fileAccess/index.js";

const log = createLogger("API:Server");

export function registerDeleteFilesRoute(router) {
  router.post("/delete-files", requireRole("admin"), async (req, res) => {
    try {
      const fileAccess = new LocalFiles();
      const { path: deletePath } = req.body;

      if (!deletePath || !isValidPath(deletePath)) {
        return res.status(400).json({ error: "Invalid path" });
      }

      // Safety check: path must exist and contain PZ server files
      if (!(await fileAccess.exists(deletePath))) {
        return res.status(404).json({ error: "Path does not exist" });
      }

      // Check for known PZ server markers to prevent accidental deletion of wrong folders
      // Require one of the PZ-specific files (not just generic dirs like 'java')
      const pzSpecificMarkers = [
        "ProjectZomboid64.json",
        "ProjectZomboid32.json",
        "StartServer64.bat",
        "StartServer32.bat",
        "start-server.sh",
      ];
      let hasPzFiles = false;
      for (const marker of pzSpecificMarkers) {
        if (await fileAccess.exists(path.join(deletePath, marker))) {
          hasPzFiles = true;
          break;
        }
      }

      // Also reject paths containing '..' after normalization
      const normalizedDelete = path.normalize(deletePath);
      if (normalizedDelete.includes("..")) {
        return res.status(400).json({ error: "Invalid path" });
      }

      if (!hasPzFiles) {
        return res.status(400).json({
          error:
            "This does not appear to be a Project Zomboid server installation. Refusing to delete for safety.",
        });
      }

      log.warn(`Deleting server files at: ${deletePath}`);

      // Use recursive delete
      await fileAccess.rm(deletePath, { recursive: true, force: true });

      log.info(`Successfully deleted server files at: ${deletePath}`);
      res.json({ success: true, message: "Server files deleted" });
    } catch (error) {
      log.error(`Failed to delete server files: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}
