import express from "express";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Chunks");
import { sanitizeError } from "../../utils/sanitize.js";
import { hasB42IndicatorFiles } from "./geometry.js";
import { getZomboidDataPath, resolveSavesPath, resolveCustomOrDefaultDataPath } from "./savePaths.js";
import { createScanState, scanMapDirectory } from "./chunkScanner.js";
import { scanB41RootFallback, scanChunkDataFolder } from "./chunkScanFallbacks.js";
import { LocalFiles } from "../../services/fileAccess/index.js";

const router = express.Router();

function makeProgressEmitter(req, scanId) {
  const io = req.app.get("io");
  let lastProgressAt = 0;
  return (scanned, total, found, { force = false } = {}) => {
    if (!io || !scanId) return;
    const now = Date.now();
    // Throttle to ~5/sec to avoid flooding the socket on fast local disks.
    if (!force && now - lastProgressAt < 200) return;
    lastProgressAt = now;
    io.emit("chunkScan:progress", { scanId, scanned, total, chunks: found });
  };
}

// Get chunk data for a specific save
router.get("/chunks/:saveName", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const { saveName } = req.params;
    const customPath = req.query.customPath
      ? String(req.query.customPath)
      : null;

    // Optional progress streaming: the client passes a scanId and subscribes to
    // `chunkScan:progress` over Socket.IO. Scanning a huge save over a slow UNC
    // share can take a while, so we report % completion (by directory) instead
    // of capping the result. No scanId → no emits (back-compat).
    const scanId = req.query.scanId ? String(req.query.scanId) : null;
    const emitProgress = makeProgressEmitter(req, scanId);

    // Sanitize saveName to prevent path traversal
    const sanitizedSaveName = path.basename(saveName);
    if (!sanitizedSaveName || sanitizedSaveName !== saveName) {
      return res.status(400).json({ error: "Invalid save name" });
    }

    let zomboidDataPath;
    if (customPath) {
      zomboidDataPath = await resolveCustomOrDefaultDataPath(String(customPath));
    } else {
      zomboidDataPath = await getZomboidDataPath();
    }

    if (!zomboidDataPath) {
      return res.status(400).json({ error: "Zomboid data path not set" });
    }

    // Resolve the saves path the same way as /saves
    let savesPath = await resolveSavesPath(zomboidDataPath);

    const savePath = path.join(savesPath, sanitizedSaveName);
    const mapPath = path.join(savePath, "map");

    log.info(
      `[ChunkCleaner] Loading chunks for "${sanitizedSaveName}" from: ${mapPath}`,
    );

    if (!(await fileAccess.exists(savePath))) {
      log.warn(`[ChunkCleaner] Save directory not found: ${savePath}`);
      return res.json({ chunks: [], bounds: null });
    }

    const state = createScanState();
    let isB42 = await scanMapDirectory(savePath, state, {
      onProgress: emitProgress,
    });

    // Secondary B42 detection: if map/ is empty (no subdirs, no flat files),
    // check for B42-specific files in the save root. B42 saves have files like
    // WorldDictionary.bin, global_mod_data.bin, entity_data.bin that B41 doesn't.
    if (!isB42 && state.chunks.length === 0 && (await hasB42IndicatorFiles(savePath))) {
      isB42 = true;
      log.info(
        `[ChunkCleaner] Detected B42 save via indicator files (map/ is empty)`,
      );
    }

    await scanB41RootFallback(savePath, state, isB42);
    await scanChunkDataFolder(savePath, state, isB42);

    const { chunks, totalChunks, minX, maxX, minY, maxY } = state;
    const bounds = chunks.length > 0 ? { minX, maxX, minY, maxY } : null;

    // Sort chunks by coordinate for consistent rendering order
    chunks.sort((a, b) => a.x - b.x || a.y - b.y);

    res.json({
      saveName,
      chunks,
      shownChunks: chunks.length,
      totalChunks,
      bounds,
      limitReached: false,
      maxChunks: null,
      isB42,
    });
  } catch (error) {
    // resolveCustomOrDefaultDataPath throws 400/403 for bad custom paths —
    // forward that status (and structured rejection details) instead of
    // masking it as a generic 500 so the UI can render targeted remediation.
    const isUserError = error.statusCode && error.statusCode < 500;
    if (isUserError)
      log.warn(`Get chunks rejected (${error.statusCode}): ${error.message}`);
    else log.error(`Failed to get chunks: ${error.message}`);
    const payload = { error: sanitizeError(error.message) };
    if (error.details) payload.rejection = error.details;
    res.status(error.statusCode || 500).json(payload);
  }
});

export default router;
