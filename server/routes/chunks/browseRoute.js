import express from "express";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Chunks");
import { sanitizeError } from "../../utils/sanitize.js";
import { getZomboidDataPath } from "./savePaths.js";
import { LocalFiles } from "../../services/fileAccess/index.js";
import { confineToRoots } from "../../utils/browseRoots.js";

const router = express.Router();

// Browse a path — list directories for manual navigation
router.get("/browse", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const browsePath = req.query.path ? String(req.query.path) : null;
    const zomboidDataPath = await getZomboidDataPath();

    if (!browsePath) {
      // Return the current zomboidDataPath as starting point
      return res.json({
        currentPath: zomboidDataPath || "",
        directories: [],
        hasSaves: false,
      });
    }

    if (!zomboidDataPath) {
      return res
        .status(400)
        .json({ error: "No Zomboid data path configured to browse" });
    }

    const allowedRoots = [path.resolve(zomboidDataPath)];
    const resolved = confineToRoots(browsePath, allowedRoots);
    if (!resolved) {
      return res.status(403).json({
        error: "Access denied: path is outside the server's save directory",
      });
    }

    if (!(await fileAccess.exists(resolved))) {
      return res.status(400).json({ error: "Path does not exist" });
    }

    const stat = await fileAccess.stat(resolved);
    if (!stat || !stat.isDirectory) {
      return res.status(400).json({ error: "Path is not a directory" });
    }

    const entries = await fileAccess.readdir(resolved, {
      withFileTypes: true,
    });
    const directories = entries
      .filter((d) => d.isDirectory)
      .map((d) => d.name)
      .sort();

    // Check if this path has a Saves/Multiplayer structure
    const savesMultiplayer = path.join(resolved, "Saves", "Multiplayer");
    const hasSavesMultiplayer = await fileAccess.exists(savesMultiplayer);

    // Or if it IS a Saves/Multiplayer path
    const basename = path.basename(resolved);
    const parentBase = path.basename(path.dirname(resolved));
    const isSavesMultiplayer =
      basename === "Multiplayer" && parentBase === "Saves";

    // Check if any child dirs contain a map/ folder or B41 root chunk files (direct save dirs)
    const B41_ROOT_REGEX = /^map_\d+_\d+\.bin$/i;
    const mapFolderChecks = await Promise.all(
      directories.map(async (d) => {
        const childPath = path.join(resolved, d);
        if (await fileAccess.exists(path.join(childPath, "map"))) return true;
        // B41 fallback: check for map_X_Y.bin files in the child directory
        try {
          const childFiles = await fileAccess.readdir(childPath);
          return childFiles.some((f) => B41_ROOT_REGEX.test(f));
        } catch (e) {
          log.debug(`B41 check failed for ${d}: ${e.message}`);
          return false;
        }
      }),
    );
    const hasMapFolders = mapFolderChecks.some(Boolean);

    res.json({
      currentPath: resolved,
      directories,
      hasSaves: hasSavesMultiplayer || isSavesMultiplayer || hasMapFolders,
      parent:
        path.dirname(resolved) !== resolved &&
        confineToRoots(path.dirname(resolved), allowedRoots)
          ? path.dirname(resolved)
          : null,
    });
  } catch (error) {
    log.error(`Failed to browse path: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
