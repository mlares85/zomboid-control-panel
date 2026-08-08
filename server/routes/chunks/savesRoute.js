import express from "express";
import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Chunks");
import { sanitizeError } from "../../utils/sanitize.js";
import { getCandidateZomboidPaths } from "../../utils/zomboidPaths.js";
import {
  getZomboidDataPath,
  resolveSavesPath,
  resolveCustomOrDefaultDataPath,
} from "./savePaths.js";
import { getDirSize, countFiles, formatBytes } from "./fsHelpers.js";

const router = express.Router();

// Get list of available saves
router.get("/saves", async (req, res) => {
  try {
    // Support custom path override from query parameter
    const customPath = req.query.customPath
      ? String(req.query.customPath)
      : null;

    let zomboidDataPath;
    // Tracks whether we silently selected a candidate path when none was
    // configured — surfaced to the UI so the user can confirm/persist it.
    let autoPickedFrom = null;
    if (customPath) {
      // Validate custom path exists and is a directory
      const normalized = resolveCustomOrDefaultDataPath(customPath);
      zomboidDataPath = normalized;
      log.info(`[ChunkCleaner] Using custom path: ${normalized}`);
    } else {
      zomboidDataPath = await getZomboidDataPath();
    }

    if (!zomboidDataPath) {
      // No path configured — before bouncing to an error, try to auto-pick
      // a candidate that has saves on disk. This is the common case for a
      // fresh install where the panel was started before any server was
      // configured. Pick only if exactly one candidate has saves to avoid
      // silently choosing the wrong one when multiple installs exist.
      const candidates = getCandidateZomboidPaths();
      const withSaves = candidates.filter((c) => c.hasSaves);
      if (withSaves.length === 1) {
        zomboidDataPath = withSaves[0].path;
        autoPickedFrom = zomboidDataPath;
        log.info(
          `[ChunkCleaner] Auto-picked Zomboid data path: ${zomboidDataPath}`,
        );
      } else {
        return res.status(400).json({
          error:
            "Zomboid data path not set. " +
            "Configure a server in Settings → Servers, or use the Custom path field below to point at your Zomboid folder.",
          debug: {
            zomboidDataPath: null,
            savesPath: null,
            exists: false,
            usedCustomPath: false,
            hint:
              withSaves.length > 1
                ? `Found ${withSaves.length} candidate folders with saves — pick one below.`
                : "No Zomboid data folder is configured for this panel.",
            suggestedPaths: candidates,
          },
        });
      }
    }

    // Try the standard path first, then check if the path IS a Saves/Multiplayer dir directly
    let savesPath = resolveSavesPath(zomboidDataPath);
    const attempted = [savesPath];

    if (!fs.existsSync(savesPath)) {
      // Maybe the user pointed directly to Saves/Multiplayer
      const basename = path.basename(zomboidDataPath);
      const parentDir = path.dirname(zomboidDataPath);
      const parentBase = path.basename(parentDir);
      const grandparentBase = path.basename(path.dirname(parentDir));
      if (basename === "Multiplayer" && parentBase === "Saves") {
        savesPath = zomboidDataPath;
        log.info(`[ChunkCleaner] Path points directly to Saves/Multiplayer`);
      } else if (basename === "Saves") {
        savesPath = path.join(zomboidDataPath, "Multiplayer");
        attempted.push(savesPath);
        log.info(`[ChunkCleaner] Path points directly to Saves dir`);
      } else if (parentBase === "Multiplayer" && grandparentBase === "Saves") {
        // Individual save directory — walk up to list siblings
        savesPath = parentDir;
        attempted.push(savesPath);
        log.info(
          `[ChunkCleaner] Path points to an individual save; using parent Saves/Multiplayer`,
        );
      } else {
        log.warn(`[ChunkCleaner] Saves path not found: ${savesPath}`);
        log.info(`[ChunkCleaner] zomboidDataPath: ${zomboidDataPath}`);
        return res.json({
          saves: [],
          debug: {
            zomboidDataPath,
            savesPath,
            exists: false,
            usedCustomPath: Boolean(customPath),
            attempted,
            hint:
              `Looked for ${path.join("Saves", "Multiplayer")} inside the data folder but didn't find it. ` +
              `Has this server ever been started, or is the data path pointing at the wrong place?`,
            suggestedPaths: customPath ? [] : getCandidateZomboidPaths(),
          },
        });
      }
    }

    if (!fs.existsSync(savesPath)) {
      log.warn(
        `[ChunkCleaner] Resolved saves path does not exist: ${savesPath}`,
      );
      return res.json({
        saves: [],
        debug: {
          zomboidDataPath,
          savesPath,
          exists: false,
          usedCustomPath: Boolean(customPath),
          attempted,
          hint: `The resolved saves folder doesn't exist on disk. Start the server once to create it, or pick a different data path.`,
          suggestedPaths: customPath ? [] : getCandidateZomboidPaths(),
        },
      });
    }

    log.info(`[ChunkCleaner] Listing saves from: ${savesPath}`);

    let entries;
    try {
      entries = await fs.promises.readdir(savesPath, { withFileTypes: true });
    } catch (e) {
      log.warn(
        `[ChunkCleaner] Failed to read saves dir ${savesPath}: ${e.message}`,
      );
      const code = e.code || "EREAD";
      const hint =
        code === "EACCES" || code === "EPERM"
          ? `Panel does not have permission to read this folder. On Linux, check that the panel runs as the same user that owns the Zomboid folder (or fix permissions with chown/chmod).`
          : `Could not read the saves folder (${code}).`;
      return res.status(403).json({
        error: hint,
        debug: {
          zomboidDataPath,
          savesPath,
          exists: true,
          usedCustomPath: Boolean(customPath),
          attempted,
          hint,
          errorCode: code,
        },
      });
    }
    // Exclude our own `backups` folder. Chunk/region deletions write backups
    // to `<zomboidDataPath>/backups`. When the user points the data path
    // directly at `Saves/Multiplayer` (a supported config), that backups
    // folder lands inside the saves listing and would otherwise show up as a
    // fake, un-loadable "save". It is never a real PZ multiplayer save.
    const directories = entries.filter(
      (d) => d.isDirectory() && d.name.toLowerCase() !== "backups",
    );

    log.info(
      `[ChunkCleaner] Found ${directories.length} save directories: ${directories.map((d) => d.name).join(", ")}`,
    );

    const saves = await Promise.all(
      directories.map(async (d) => {
        const savePath = path.join(savesPath, d.name);
        const stats = await fs.promises.stat(savePath);

        // Count chunk files (uses recursive count for B42's subdirectory structure)
        // Also check save root for B41 flat chunk files
        let chunkCount = 0;
        const mapPath = path.join(savePath, "map");
        if (fs.existsSync(mapPath)) {
          chunkCount = await countFiles(mapPath);
        }
        if (chunkCount === 0) {
          // B41 fallback: count map_X_Y.bin files in save root
          const B41_CHUNK_REGEX = /^map_\d+_\d+\.bin$/i;
          try {
            const rootEntries = await fs.promises.readdir(savePath);
            chunkCount = rootEntries.filter((f) =>
              B41_CHUNK_REGEX.test(f),
            ).length;
          } catch (e) {
            log.debug(
              `B41 chunk count fallback failed for ${savePath}: ${e.message}`,
            );
          }
        }

        // Get save size
        const size = await getDirSize(savePath);

        return {
          name: d.name,
          modified: stats.mtime,
          chunkCount,
          size,
          sizeFormatted: formatBytes(size),
        };
      }),
    );

    res.json({
      saves,
      debug: {
        zomboidDataPath,
        savesPath,
        exists: true,
        usedCustomPath: Boolean(customPath),
        autoPicked: autoPickedFrom,
        hint:
          saves.length === 0
            ? `Saves folder exists but contains no save directories. Start the server once, or pick a different folder.`
            : null,
        suggestedPaths:
          saves.length === 0 && !customPath ? getCandidateZomboidPaths() : [],
      },
    });
  } catch (error) {
    // User-input rejections (400/403 with structured details) are not panel
    // bugs — log them at WARN so alerting/email pipelines don't fire on every
    // typo in the path field. Real failures (no statusCode = 500) stay ERROR.
    const isUserError = error.statusCode && error.statusCode < 500;
    if (isUserError) {
      log.warn(`Get saves rejected (${error.statusCode}): ${error.message}`);
    } else {
      log.error(`Failed to get saves: ${error.message}`);
    }
    // Forward structured rejection details (reason, checks, parentSuggestion)
    // so the frontend empty-state panel can render targeted remediation.
    const payload = { error: sanitizeError(error.message) };
    if (error.details) {
      payload.debug = {
        zomboidDataPath: null,
        savesPath: null,
        exists: false,
        usedCustomPath: true,
        hint: error.message,
        rejection: error.details,
        suggestedPaths: getCandidateZomboidPaths(),
      };
    }
    res.status(error.statusCode || 500).json(payload);
  }
});

export default router;
