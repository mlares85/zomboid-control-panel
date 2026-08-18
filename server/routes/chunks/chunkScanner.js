import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Chunks");
import { LocalFiles } from "../../services/fileAccess/index.js";

const fileAccess = new LocalFiles();

export function createScanState() {
  return {
    chunks: [],
    seenChunkCoords: new Set(),
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    totalChunks: 0,
  };
}

export function rememberChunkCoord(state, x, y) {
  const key = `${x},${y}`;
  if (state.seenChunkCoords.has(key)) return false;
  state.seenChunkCoords.add(key);
  state.totalChunks++;
  state.minX = Math.min(state.minX, x);
  state.maxX = Math.max(state.maxX, x);
  state.minY = Math.min(state.minY, y);
  state.maxY = Math.max(state.maxY, y);
  return true;
}

// B42 uses subdirectory structure: map/{X}/{Y}.bin
// B41 may use flat files inside map/ OR flat files in the save root.
// Populates state.chunks and tracks bounds via rememberChunkCoord. Returns
// whether the save uses the B42 layout (numeric X subdirectories present).
export async function scanMapDirectory(savePath, state, { onProgress } = {}) {
  const mapPath = path.join(savePath, "map");
  const mapExists = await fileAccess.exists(mapPath);

  let mapContents = [];
  let xDirs = [];
  let flatBinFiles = [];

  if (mapExists) {
    mapContents = await fileAccess.readdir(mapPath, { withFileTypes: true });
    xDirs = mapContents.filter((d) => d.isDirectory && /^\d+$/.test(d.name));
    flatBinFiles = mapContents.filter(
      (f) => f.isFile && f.name.endsWith(".bin"),
    );
  }

  log.info(
    `[ChunkCleaner] map/ ${mapExists ? "exists" : "missing"}: ${mapContents.length} entries, ${xDirs.length} numeric dirs (B42), ${flatBinFiles.length} flat .bin files (B41)`,
  );

  if (xDirs.length > 0) {
    await scanB42Directories(mapPath, xDirs, state, onProgress);
  } else {
    await scanLegacyFlatFiles(mapPath, mapContents, state);
  }

  return xDirs.length > 0;
}

async function scanB42Directories(mapPath, xDirs, state, onProgress) {
  // B42 structure: map/{X}/{Y}.bin
  // Use sequential directory scans to avoid overwhelming the filesystem.
  let totalBinFiles = 0;
  let totalNonBinFiles = 0;
  let sampleNonBinFiles = [];
  let emptyDirs = 0;
  let scannedDirs = 0;
  onProgress?.(0, xDirs.length, 0, { force: true });

  for (const xDir of xDirs) {
    const x = parseInt(xDir.name, 10);
    const xPath = path.join(mapPath, xDir.name);

    try {
      // Read Y files in this X directory
      const yEntries = await fileAccess.readdir(xPath, {
        withFileTypes: true,
      });
      // Only process files (skip subdirectories inside chunk dirs)
      const yFiles = yEntries.filter((e) => e.isFile).map((e) => e.name);

      if (yFiles.length === 0) {
        emptyDirs++;
        continue;
      }

      const binFiles = yFiles.filter((f) => f.endsWith(".bin"));
      const nonBinFiles = yFiles.filter((f) => !f.endsWith(".bin"));
      totalBinFiles += binFiles.length;
      totalNonBinFiles += nonBinFiles.length;
      if (nonBinFiles.length > 0 && sampleNonBinFiles.length < 5) {
        sampleNonBinFiles.push(
          ...nonBinFiles.slice(0, 3).map((f) => `${xDir.name}/${f}`),
        );
      }

      const chunkEntries = [];
      for (const yFile of binFiles) {
        const yMatch = yFile.match(/^(\d+)\.bin$/);
        if (!yMatch) continue;

        const y = parseInt(yMatch[1], 10);
        if (!rememberChunkCoord(state, x, y)) continue;

        chunkEntries.push({ x, y, yFile });
      }

      const results = await Promise.all(
        chunkEntries.map(async ({ x, y, yFile }) => {
          const filePath = path.join(xPath, yFile);

          try {
            const stats = await fileAccess.stat(filePath);
            if (!stats) throw new Error("ENOENT");
            return {
              file: `${x}/${yFile}`,
              x,
              y,
              size: stats.size,
              modified: new Date(stats.mtimeMs),
            };
          } catch (e) {
            log.debug(`Stat failed for chunk ${x}/${yFile}: ${e.message}`);
            return null;
          }
        }),
      );

      for (const chunk of results) {
        if (chunk) state.chunks.push(chunk);
      }
    } catch (err) {
      log.warn(`Error reading chunk directory ${xPath}: ${err.message}`);
    }

    scannedDirs++;
    onProgress?.(scannedDirs, xDirs.length, state.chunks.length);
  }

  // Diagnostic: log what was found inside the B42 dirs
  log.info(
    `[ChunkCleaner] B42 scan: ${state.totalChunks} chunks loaded, ${totalBinFiles} .bin files, ${emptyDirs} empty dirs, ${totalNonBinFiles} non-.bin files${sampleNonBinFiles.length > 0 ? " (samples: " + sampleNonBinFiles.join(", ") + ")" : ""}`,
  );
  onProgress?.(xDirs.length, xDirs.length, state.chunks.length, {
    force: true,
  });
}

async function scanLegacyFlatFiles(mapPath, mapContents, state) {
  // Legacy flat file structure: map_X_Y.bin or X_Y.bin
  const files = mapContents
    .filter((f) => f.isFile && f.name.endsWith(".bin"))
    .map((f) => f.name);

  const chunkEntries = [];
  for (const file of files) {
    // Common formats: map_X_Y.bin, chunkdata_X_Y.bin, X_Y.bin
    const match = file.match(
      /(?:map_|chunkdata_|chunk_)?(\d+)_(\d+)(?:_\d+)?\.bin$/i,
    );
    if (match) {
      const x = parseInt(match[1], 10);
      const y = parseInt(match[2], 10);
      if (!rememberChunkCoord(state, x, y)) continue;

      chunkEntries.push({ file, x, y });
    }
  }

  const legacyResults = await Promise.all(
    chunkEntries.map(async ({ file, x, y }) => {
      try {
        const stats = await fileAccess.stat(path.join(mapPath, file));
        if (!stats) throw new Error("ENOENT");
        return {
          file,
          x,
          y,
          size: stats.size,
          modified: new Date(stats.mtimeMs),
        };
      } catch (e) {
        log.debug(`Stat failed for legacy chunk ${file}: ${e.message}`);
        return null;
      }
    }),
  );

  for (const res of legacyResults) {
    if (res) {
      state.chunks.push(res);
    }
  }
}
