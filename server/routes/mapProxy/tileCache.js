import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
import { getDataPaths } from "../../utils/paths.js";

const log = createLogger("API:MapProxy");

// ─── Persistent disk-backed tile cache ───────────────────────────────────
// A given PZ map build's tiles never change once published, so unlike a
// typical HTTP cache these never need to expire — once a tile has been
// fetched from map.projectzomboid.com it's cached on disk indefinitely.
// Over time this turns the proxy into a self-hosted mirror of whatever
// parts of the map players have actually looked at, with zero upfront
// download and no dependency on the upstream host for anything already
// cached. A small in-memory LRU sits in front of disk to avoid a
// filesystem read on every request for hot tiles.
export const TILE_CACHE_DIR = path.join(getDataPaths().dataDir, "map-tiles-cache");
const MEM_CACHE_MAX = 500;
const memCache = new Map(); // relPath -> { buffer, contentType }

export function memCacheGet(relPath) {
  const entry = memCache.get(relPath);
  if (!entry) return null;
  // Refresh LRU position
  memCache.delete(relPath);
  memCache.set(relPath, entry);
  return entry;
}

export function memCachePut(relPath, buffer, contentType) {
  if (memCache.size >= MEM_CACHE_MAX) {
    const oldestKey = memCache.keys().next().value;
    if (oldestKey !== undefined) memCache.delete(oldestKey);
  }
  memCache.set(relPath, { buffer, contentType });
}

function diskPathFor(relPath) {
  return path.join(TILE_CACHE_DIR, relPath);
}

export async function readDiskCache(relPath) {
  try {
    return await fs.promises.readFile(diskPathFor(relPath));
  } catch {
    return null;
  }
}

// Fire-and-forget: a disk cache write failing (permissions, full disk) just
// means we re-fetch from upstream next time — never block the response on it.
export function writeDiskCacheAsync(relPath, buffer) {
  const dest = diskPathFor(relPath);
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  fs.promises
    .mkdir(path.dirname(dest), { recursive: true })
    .then(() => fs.promises.writeFile(tmp, buffer))
    .then(() => fs.promises.rename(tmp, dest))
    .catch((err) => {
      log.debug(`Disk tile cache write failed for ${relPath}: ${err.message}`);
      fs.promises.unlink(tmp).catch(() => {});
    });
}
