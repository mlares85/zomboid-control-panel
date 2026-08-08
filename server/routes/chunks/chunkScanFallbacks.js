import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Chunks");
import { rememberChunkCoord } from "./chunkScanner.js";

// B41 fallback: if map/ didn't yield any chunks, check save root for
// flat chunk files like map_X_Y.bin (common B41 save layout).
export async function scanB41RootFallback(savePath, state, isB42) {
  if (isB42 || state.totalChunks !== 0) return;

  const B41_CHUNK_REGEX = /^map_(\d+)_(\d+)\.bin$/i;
  const rootEntries = await fs.promises.readdir(savePath, {
    withFileTypes: true,
  });
  const rootBinFiles = rootEntries.filter(
    (f) => f.isFile() && B41_CHUNK_REGEX.test(f.name),
  );

  if (rootBinFiles.length === 0) return;

  log.info(
    `[ChunkCleaner] Found ${rootBinFiles.length} B41 chunk files in save root`,
  );

  const chunkEntries = [];
  for (const entry of rootBinFiles) {
    const match = entry.name.match(B41_CHUNK_REGEX);
    if (!match) continue;

    const x = parseInt(match[1], 10);
    const y = parseInt(match[2], 10);
    if (!rememberChunkCoord(state, x, y)) continue;

    chunkEntries.push({ entry, x, y });
  }

  const rootResults = await Promise.all(
    chunkEntries.map(async ({ entry, x, y }) => {
      try {
        const stats = await fs.promises.stat(path.join(savePath, entry.name));
        return {
          file: entry.name,
          x,
          y,
          size: stats.size,
          modified: stats.mtime,
          source: "saveroot",
        };
      } catch (e) {
        log.debug(
          `Stat failed for B41 root chunk ${entry.name}: ${e.message}`,
        );
        return null;
      }
    }),
  );

  for (const res of rootResults) {
    if (res) {
      state.chunks.push(res);
    }
  }
}

// Also check chunkdata folder for additional chunk data.
// In B41 saves, chunkdata coords match chunk coords directly.
// In B42 saves, chunkdata uses CELL coordinates and is converted here to
// native B42 chunk coordinates (× 32). Original cell coords are preserved
// in cellX/cellY for deletion operations.
//
// NOTE: chunkdata entries are kept in a SEPARATE dedup namespace from map
// chunks. A chunkdata entry represents an entire cell's state (256×256
// tiles on B42), not just the corner chunk. Previously these got dropped
// when `map/0/0.bin` already claimed coord (0,0) — which meant the user
// could not select the cell-wide chunkdata entry, and its cell-span
// vehicle/state cleanup never ran.
export async function scanChunkDataFolder(savePath, state, isB42) {
  const seenChunkDataCoords = new Set();
  const chunkDataPath = path.join(savePath, "chunkdata");
  if (!fs.existsSync(chunkDataPath)) return;

  const chunkDataFiles = await fs.promises.readdir(chunkDataPath);
  const validFiles = chunkDataFiles.filter((f) => f.endsWith(".bin"));

  const chunkEntries = [];
  for (const file of validFiles) {
    const match = file.match(/(\d+)_(\d+)(?:_\d+)?\.bin$/i);
    if (match) {
      const rawX = parseInt(match[1], 10);
      const rawY = parseInt(match[2], 10);

      const displayX = isB42 ? rawX * 32 : rawX * 30;
      const displayY = isB42 ? rawY * 32 : rawY * 30;

      // Dedup against ONLY other chunkdata entries, not against map
      // chunks — the two sources cover different amounts of world state.
      const cdKey = `${displayX},${displayY}`;
      if (seenChunkDataCoords.has(cdKey)) continue;
      seenChunkDataCoords.add(cdKey);
      // Track for bounds even though rememberChunkCoord was skipped.
      state.minX = Math.min(state.minX, displayX);
      state.maxX = Math.max(state.maxX, displayX);
      state.minY = Math.min(state.minY, displayY);
      state.maxY = Math.max(state.maxY, displayY);
      state.totalChunks++;

      chunkEntries.push({ file, rawX, rawY, displayX, displayY });
    }
  }

  const chunkDataResults = await Promise.all(
    chunkEntries.map(async ({ file, rawX, rawY, displayX, displayY }) => {
      try {
        const stats = await fs.promises.stat(path.join(chunkDataPath, file));
        return {
          file,
          x: displayX,
          y: displayY,
          size: stats.size,
          modified: stats.mtime,
          source: "chunkdata",
          cellX: rawX,
          cellY: rawY,
        };
      } catch (e) {
        log.debug(`Stat failed for chunkdata ${file}: ${e.message}`);
        return null;
      }
    }),
  );

  for (const res of chunkDataResults) {
    if (res) {
      state.chunks.push(res);
    }
  }
}
