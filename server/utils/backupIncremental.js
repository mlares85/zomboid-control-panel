import fs from "fs";
import path from "path";

export const MANIFEST_FILENAME = "backup-manifest.json";

/**
 * Walk a directory tree and return `{ relPath: { mtimeMs, size } }` for
 * every regular file. Unreadable entries are skipped rather than failing
 * the whole scan — matches how the rest of the backup code treats
 * permission errors during a walk.
 */
export async function scanDirectory(rootDir) {
  const files = {};

  async function walk(currentDir, relPrefix) {
    let entries;
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const full = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.promises.stat(full);
          files[rel] = { mtimeMs: stat.mtimeMs, size: stat.size };
        } catch {
          /* file vanished mid-scan or unreadable — skip it */
        }
      }
    }
  }

  await walk(rootDir, "");
  return files;
}

export function loadManifest(manifestPath) {
  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      files: parsed.files || {},
      lastFullBackupId: parsed.lastFullBackupId || null,
      backupCount: parsed.backupCount || 0,
    };
  } catch {
    return { files: {}, lastFullBackupId: null, backupCount: 0 };
  }
}

export function saveManifest(manifestPath, manifest) {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * Files that are new or whose mtime/size changed since the manifest was
 * last written. Deletions are reported separately — an incremental archive
 * can't "un-include" a file, so callers just note removed paths for
 * informational purposes (they won't appear in the incremental archive,
 * and applying the chain in order naturally drops them from the restore
 * target if the full backup that follows omits them too).
 */
export function diffAgainstManifest(currentFiles, manifest) {
  const previous = manifest.files || {};
  const changed = [];
  for (const [rel, info] of Object.entries(currentFiles)) {
    const prev = previous[rel];
    if (!prev || prev.mtimeMs !== info.mtimeMs || prev.size !== info.size) {
      changed.push(rel);
    }
  }
  const removed = Object.keys(previous).filter((rel) => !(rel in currentFiles));
  return { changed, removed };
}

export function shouldRunFull(manifest, fullEveryN = 7) {
  if (!manifest.lastFullBackupId) return true;
  return (manifest.backupCount || 0) >= fullEveryN;
}

export function sumSizes(filesMap, relPaths) {
  const list = relPaths || Object.keys(filesMap);
  return list.reduce((total, rel) => total + (filesMap[rel]?.size || 0), 0);
}

/**
 * Manifest state to persist once a backup (full or incremental) succeeds.
 * `currentFiles` is always the full fresh directory scan — a full backup
 * resets the base and counter, an incremental just advances the counter
 * while keeping the same base.
 */
export function recordManifestAfterBackup(manifest, { backupId, type, currentFiles }) {
  return {
    files: currentFiles,
    lastFullBackupId: type === "full" ? backupId : manifest.lastFullBackupId,
    backupCount: type === "full" ? 0 : (manifest.backupCount || 0) + 1,
  };
}

/**
 * Order the full backup + incrementals needed to restore `targetId`,
 * oldest first. Throws if the chain is broken (missing base, cycle).
 */
export function resolveRestoreChain(records, targetId) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const target = byId.get(targetId);
  if (!target) throw new Error(`Backup record not found: ${targetId}`);

  const chain = [];
  const seen = new Set();
  let current = target;

  while (current) {
    if (seen.has(current.id)) {
      throw new Error(`Circular incremental chain detected at ${current.id}`);
    }
    seen.add(current.id);
    chain.unshift(current);

    if (current.type === "full") break;
    if (!current.incrementalBase) {
      throw new Error(
        `Incremental backup ${current.id} has no base backup recorded`,
      );
    }
    const base = byId.get(current.incrementalBase);
    if (!base) {
      throw new Error(
        `Base backup ${current.incrementalBase} for ${current.id} is missing from history`,
      );
    }
    current = base;
  }

  return chain;
}
