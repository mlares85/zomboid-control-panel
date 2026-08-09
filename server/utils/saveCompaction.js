import fs from "fs";
import path from "path";
import { createLogger } from "./logger.js";

const log = createLogger("Backup:Compaction");

const B42_Y_PATTERN = /^(\d+)\.bin$/;
const B41_FLAT_PATTERN = /(?:map_|chunkdata_|chunk_)?(\d+)_(\d+)(?:_\d+)?\.bin$/i;
export const DEFAULT_STALE_DAYS = 30;

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function scanB42(mapPath, xDirs) {
  const chunks = [];
  for (const xDir of xDirs) {
    const x = parseInt(xDir.name, 10);
    const xPath = path.join(mapPath, xDir.name);
    let yEntries;
    try {
      yEntries = await fs.promises.readdir(xPath, { withFileTypes: true });
    } catch {
      continue;
    }
    const binFiles = yEntries.filter((e) => e.isFile() && e.name.endsWith(".bin"));
    const results = await Promise.all(
      binFiles.map(async (entry) => {
        const match = entry.name.match(B42_Y_PATTERN);
        if (!match) return null;
        const y = parseInt(match[1], 10);
        try {
          const stat = await fs.promises.stat(path.join(xPath, entry.name));
          return { file: `${x}/${entry.name}`, x, y, size: stat.size, modified: stat.mtime };
        } catch {
          return null;
        }
      }),
    );
    chunks.push(...results.filter(Boolean));
  }
  return chunks;
}

async function scanFlatFiles(mapPath, entries) {
  const files = entries.filter((e) => e.isFile() && e.name.endsWith(".bin"));
  const results = await Promise.all(
    files.map(async (entry) => {
      const match = entry.name.match(B41_FLAT_PATTERN);
      if (!match) return null;
      const x = parseInt(match[1], 10);
      const y = parseInt(match[2], 10);
      try {
        const stat = await fs.promises.stat(path.join(mapPath, entry.name));
        return { file: entry.name, x, y, size: stat.size, modified: stat.mtime };
      } catch {
        return null;
      }
    }),
  );
  return results.filter(Boolean);
}

/**
 * Scan `savePath/map` for chunk files — B42's `map/{X}/{Y}.bin` subdirectory
 * layout, or B41's flat `map_X_Y.bin` files directly inside `map/`. Mirrors
 * the layout detection already used by the chunk-cleanup UI (routes/chunks.js),
 * reimplemented standalone here rather than importing from that 2000+ line
 * route file.
 */
export async function scanSaveChunks(savePath) {
  const mapPath = path.join(savePath, "map");
  if (!fs.existsSync(mapPath)) return [];

  let entries;
  try {
    entries = await fs.promises.readdir(mapPath, { withFileTypes: true });
  } catch (error) {
    log.warn(`Failed to read map directory ${mapPath}: ${error.message}`);
    return [];
  }

  const xDirs = entries.filter((e) => e.isDirectory() && /^\d+$/.test(e.name));
  return xDirs.length > 0 ? scanB42(mapPath, xDirs) : scanFlatFiles(mapPath, entries);
}

/**
 * Report how much space would be freed by removing chunks not modified in
 * `staleDays`, without deleting anything.
 */
export async function previewCompaction(savePath, staleDays = DEFAULT_STALE_DAYS) {
  if (!savePath || !fs.existsSync(savePath)) {
    throw new Error(`Save not found: ${savePath || "(no path configured)"}`);
  }

  const chunks = await scanSaveChunks(savePath);
  const cutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  const staleChunks = chunks.filter((c) => new Date(c.modified).getTime() < cutoff);
  const totalSize = chunks.reduce((sum, c) => sum + c.size, 0);
  const staleSize = staleChunks.reduce((sum, c) => sum + c.size, 0);

  return {
    totalSize,
    totalSizeFormatted: formatBytes(totalSize),
    staleSize,
    staleSizeFormatted: formatBytes(staleSize),
    staleChunkCount: staleChunks.length,
    totalChunkCount: chunks.length,
    estimatedSavingsPercent: totalSize > 0 ? Math.round((staleSize / totalSize) * 100) : 0,
    staleChunks,
  };
}

/**
 * Delete stale chunk files, optionally backing each one up first. Scope is
 * intentionally narrower than the full chunk-cleanup flow in routes/chunks.js
 * (no per-cell aux file / vehicles.db cleanup) — this is a lower-risk "free
 * up space from map areas nobody has visited in a while" tool, not a
 * replacement for manual chunk deletion.
 */
export async function compactSave({
  savePath,
  backupsPath,
  staleDays = DEFAULT_STALE_DAYS,
  createBackup = true,
}) {
  const preview = await previewCompaction(savePath, staleDays);
  if (preview.staleChunks.length === 0) {
    return {
      success: true,
      deleted: 0,
      spaceFreed: 0,
      spaceFreedFormatted: formatBytes(0),
      backupCreated: false,
      message: "No stale chunks found",
    };
  }

  let backupDir = null;
  if (createBackup) {
    if (!backupsPath) throw new Error("Backups path is required when createBackup is true");
    backupDir = path.join(backupsPath, `chunks-precompact-${Date.now()}`);
    await fs.promises.mkdir(backupDir, { recursive: true });
  }

  let deleted = 0;
  const errors = [];
  for (const chunk of preview.staleChunks) {
    const filePath = path.join(savePath, "map", chunk.file);
    try {
      if (backupDir) {
        const backupName = chunk.file.replace(/[/\\]/g, "_");
        await fs.promises.copyFile(filePath, path.join(backupDir, backupName));
      }
      await fs.promises.unlink(filePath);
      deleted++;
    } catch (error) {
      if (error.code !== "ENOENT") errors.push(`${chunk.file}: ${error.message}`);
    }
  }

  log.info(`Compacted save: removed ${deleted} stale chunks, freed ${preview.staleSizeFormatted}`);

  return {
    success: true,
    deleted,
    spaceFreed: preview.staleSize,
    spaceFreedFormatted: preview.staleSizeFormatted,
    backupCreated: !!backupDir,
    errors: errors.length > 0 ? errors : undefined,
  };
}
