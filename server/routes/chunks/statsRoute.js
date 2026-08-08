import express from "express";
import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Chunks");
import { sanitizeError } from "../../utils/sanitize.js";
import { getZomboidDataPath, resolveSavesPath, resolveCustomOrDefaultDataPath } from "./savePaths.js";
import { getDirSize, countFiles, formatBytes } from "./fsHelpers.js";

const router = express.Router();

// Get save statistics
router.get("/stats/:saveName", async (req, res) => {
  try {
    const { saveName } = req.params;
    const customPath = req.query.customPath
      ? String(req.query.customPath)
      : null;

    // Sanitize saveName to prevent path traversal
    const sanitizedSaveName = path.basename(saveName);
    if (!sanitizedSaveName || sanitizedSaveName !== saveName) {
      return res.status(400).json({ error: "Invalid save name" });
    }

    let zomboidDataPath;
    if (customPath) {
      // Validate custom path the same way /saves and /chunks do — prevents
      // arbitrary filesystem reads via the stats endpoint.
      zomboidDataPath = resolveCustomOrDefaultDataPath(String(customPath));
    } else {
      zomboidDataPath = await getZomboidDataPath();
    }

    if (!zomboidDataPath) {
      return res.status(400).json({ error: "Zomboid data path not set" });
    }

    // Resolve the saves path the same way as /saves
    let savesPath = resolveSavesPath(zomboidDataPath);

    const savePath = path.join(savesPath, sanitizedSaveName);

    if (!fs.existsSync(savePath)) {
      return res.status(404).json({ error: "Save not found" });
    }

    const stats = {
      saveName,
      totalSize: await getDirSize(savePath), // Now awaited
      folders: {},
    };

    const folders = [
      "map",
      "chunkdata",
      "isoregiondata",
      "zpop",
      "metagrid",
      "apop",
      "radio",
    ];

    for (const folder of folders) {
      const folderPath = path.join(savePath, folder);
      try {
        if (fs.existsSync(folderPath)) {
          const fileCount = await countFiles(folderPath);
          const size = await getDirSize(folderPath);
          stats.folders[folder] = {
            fileCount,
            size,
            sizeFormatted: formatBytes(size),
          };
        }
      } catch (e) {
        log.debug(`Failed to stat folder ${folder}: ${e.message}`);
      }
    }

    // B41 root chunk files: count map_X_Y.bin in save root when map/ has no chunks
    if (!stats.folders.map || stats.folders.map.fileCount === 0) {
      const B41_CHUNK_REGEX = /^map_\d+_\d+\.bin$/i;
      try {
        const rootEntries = await fs.promises.readdir(savePath, {
          withFileTypes: true,
        });
        const rootChunks = rootEntries.filter(
          (f) => f.isFile() && B41_CHUNK_REGEX.test(f.name),
        );
        if (rootChunks.length > 0) {
          let rootChunkSize = 0;
          for (const f of rootChunks) {
            try {
              const s = await fs.promises.stat(path.join(savePath, f.name));
              rootChunkSize += s.size;
            } catch (e) {
              log.debug(`Stat failed for root chunk ${f.name}: ${e.message}`);
            }
          }
          stats.folders["map (root)"] = {
            fileCount: rootChunks.length,
            size: rootChunkSize,
            sizeFormatted: formatBytes(rootChunkSize),
          };
        }
      } catch (e) {
        log.debug(`B41 root chunk scan failed: ${e.message}`);
      }
    }

    // Players count
    const playersDb = path.join(savePath, "players.db");
    if (fs.existsSync(playersDb)) {
      try {
        const s = await fs.promises.stat(playersDb);
        stats.playersDbSize = s.size;
      } catch (e) {
        log.debug(`Stat failed for players.db: ${e.message}`);
      }
    }

    // Vehicles db
    const vehiclesDb = path.join(savePath, "vehicles.db");
    if (fs.existsSync(vehiclesDb)) {
      try {
        const s = await fs.promises.stat(vehiclesDb);
        stats.vehiclesDbSize = s.size;
      } catch (e) {
        log.debug(`Stat failed for vehicles.db: ${e.message}`);
      }
    }

    stats.totalSizeFormatted = formatBytes(stats.totalSize);

    res.json(stats);
  } catch (error) {
    const isUserError = error.statusCode && error.statusCode < 500;
    if (isUserError)
      log.warn(`Get stats rejected (${error.statusCode}): ${error.message}`);
    else log.error(`Failed to get save stats: ${error.message}`);
    const payload = { error: sanitizeError(error.message) };
    if (error.details) payload.rejection = error.details;
    res.status(error.statusCode || 500).json(payload);
  }
});

export default router;
