import path from "path";
import fs from "fs";
import { promises as fsp } from "fs";
import crypto from "crypto";
import { createLogger } from "../../logger.js";
import { readTextFile } from "../iniFile.js";
import {
  getServerConfigPath,
  getServerName,
  getSanitizedIniPath,
} from "../serverConfig.js";
import { getWorkshopPaths } from "../workshopPaths.js";
import { getModDetailsFromWorkshop } from "../workshopModInfo.js";
import { walkDir, yieldTick, WALK_YIELD_EVERY } from "./fsWalk.js";

const log = createLogger("API:Mods");

// ─── Shared scan helpers ────────────────────────────────────────────────────
// Re-exported so existing importers (detect.js, crossFileLua.js) keep working.
export { yieldTick };

// Max file size to hash (50 MB) — larger files are treated as different
export const HASH_MAX_BYTES = 50 * 1024 * 1024;

// Global cap on how many entries buildFileIndex() will accumulate across ALL
// mods combined (panel-oom-buildfileindex-unbounded). WALK_MAX_FILES bounds
// a single mod's walk, but that budget is created fresh per top-level
// walkDir() call, so the real ceiling was 50,000 x number of mods --
// unbounded by mod count. A heavy modlist (150 mods, several routinely near
// the per-mod ceiling) can reach millions of entries and gigabytes,
// reproducing a real V8 heap OOM crash. 300,000 entries matches the
// maxEntries budget server.js's wipe-preview countDir() already uses for
// the same class of problem.
export const FILE_INDEX_MAX_ENTRIES = 300_000;

// One mod can ship the same relative path twice (media/ plus a B42 42/ folder).
// Pairing and reporting must run on distinct mods or a mod ends up listed as
// conflicting with itself.
export function dedupeByModId(entries) {
  const byId = new Map();
  for (const entry of entries)
    if (!byId.has(entry.modId)) byId.set(entry.modId, entry);
  return [...byId.values()];
}

// Hash a single file for content comparison. Streamed so one large asset never
// lands in memory whole: a path shared by 30 mods previously allocated 30 full
// file buffers at once.
export function hashFileStreaming(filePath) {
  return new Promise((resolve) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (e) => {
      log.debug(`Error hashing file ${filePath}: ${e.message}`);
      resolve(null);
    });
  });
}

// Decide whether every mod's copy of one relative path holds the same bytes.
// Sizes are compared first: a size difference already proves the contents
// differ, so genuinely conflicting files are never read at all.
// Returns "identical", "differs" (also used whenever the answer cannot be
// verified, so a real conflict is never hidden), or "unknown" when fewer than
// two copies could be read.
export async function compareFileContents(entries) {
  const sized = await Promise.all(
    entries.map(async (entry) => {
      try {
        return { entry, size: (await fsp.stat(entry.absPath)).size };
      } catch (e) {
        log.debug(`Error reading file size ${entry.absPath}: ${e.message}`);
        return null;
      }
    }),
  );
  const readable = sized.filter(Boolean);
  const unreadable = sized.length - readable.length;
  if (readable.length < 2) return "unknown";
  if (new Set(readable.map((r) => r.size)).size > 1) return "differs";
  if (readable[0].size > HASH_MAX_BYTES) return "differs";
  const hashes = await Promise.all(
    readable.map((r) => hashFileStreaming(r.entry.absPath)),
  );
  if (hashes.some((h) => h == null)) return "differs";
  if (new Set(hashes).size > 1) return "differs";
  return unreadable === 0 ? "identical" : "differs";
}

// Read INI and return { workshopIds, modIdsFromIni }
export async function readIniModLists() {
  const serverConfigPath = await getServerConfigPath();
  const serverName = await getServerName();
  const iniPath = getSanitizedIniPath(serverConfigPath, serverName);
  let workshopIds = [];
  let modIdsFromIni = [];
  if (iniPath && fs.existsSync(iniPath)) {
    const iniContent = readTextFile(iniPath);
    const wsMatch = iniContent.match(/^WorkshopItems=(.*)$/m);
    const modsMatch = iniContent.match(/^Mods=(.*)$/m);
    if (wsMatch && wsMatch[1].trim()) {
      workshopIds = wsMatch[1]
        .trim()
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (modsMatch && modsMatch[1].trim()) {
      modIdsFromIni = modsMatch[1]
        .trim()
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return { workshopIds, modIdsFromIni };
}

// Build the file index and collect per-mod metadata.
// Calls `onModScanned(modId, modName, wsId, fileCount)` for each mod.
// If `activeModIds` is provided, only mod directories whose ID is in that set are scanned.
// `maxEntries` defaults to the real production cap; tests override it with a
// small value so the cap mechanism is provable without a fixture at the
// real 300,000-entry scale.
export async function buildFileIndex(
  workshopIds,
  serverPath,
  onModScanned,
  activeModIds,
  maxEntries = FILE_INDEX_MAX_ENTRIES,
) {
  const fileIndex = {};
  const modInfoMap = {};
  let modsScanned = 0;
  let modsNotFound = 0;
  let modsSkippedInactive = 0;
  let indexedEntries = 0;
  let indexTruncated = false;
  const warnings = [];
  const totalWorkshopIds = workshopIds.length;
  const activeSet = activeModIds ? new Set(activeModIds) : null;

  outer: for (let wsIdx = 0; wsIdx < totalWorkshopIds; wsIdx++) {
    if (indexTruncated) break;
    const wsId = workshopIds[wsIdx];
    if (!/^\d{1,15}$/.test(wsId)) {
      warnings.push(`Skipped invalid workshop ID: ${wsId.slice(0, 20)}`);
      continue;
    }
    const possiblePaths = getWorkshopPaths(wsId, serverPath);
    let workshopPath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        workshopPath = p;
        break;
      }
    }
    if (!workshopPath) {
      // Counted in modsNotFound; not pushed to warnings — would otherwise drown out real ones.
      modsNotFound++;
      continue;
    }
    const modDetails = getModDetailsFromWorkshop(wsId, serverPath);
    modInfoMap[wsId] = modDetails;
    const modsFolder = path.join(workshopPath, "mods");
    const searchBase = fs.existsSync(modsFolder) ? modsFolder : workshopPath;
    let modEntries;
    try {
      modEntries = fs.readdirSync(searchBase, { withFileTypes: true });
    } catch (e) {
      log.debug(`Could not read mod directory ${searchBase}: ${e.message}`);
      continue;
    }
    let modsFoundInThisWs = 0;
    for (const modDir of modEntries) {
      if (indexTruncated) break;
      if (!modDir.isDirectory()) continue;
      const modDirPath = path.join(searchBase, modDir.name);
      // Collect all media paths — direct + B42 versioned subfolders (42/, 42.X/, common/)
      const mediaPaths = [];
      const directMedia = path.join(modDirPath, "media");
      if (fs.existsSync(directMedia)) {
        mediaPaths.push(directMedia);
      } else {
        // B42 mods may have versioned subfolders instead of a direct media/ folder
        try {
          const subDirs = fs.readdirSync(modDirPath, { withFileTypes: true });
          for (const sub of subDirs) {
            if (!sub.isDirectory()) continue;
            // Match: 42, 42.0, 42.13, common (versioned B42 subfolder patterns)
            if (/^(42(\.\d+)?|common)$/i.test(sub.name)) {
              const subMedia = path.join(modDirPath, sub.name, "media");
              if (fs.existsSync(subMedia)) mediaPaths.push(subMedia);
            }
          }
        } catch (e) {
          log.debug(
            `Could not scan B42 subfolders for ${modDirPath}: ${e.message}`,
          );
        }
      }
      if (mediaPaths.length === 0) continue;
      const matchingMod = modDetails.find(
        (m) => m.id === modDir.name || m.name === modDir.name,
      );
      const modId = matchingMod?.id || modDir.name;
      const modName = matchingMod?.name || modDir.name;
      // Skip mod directories that aren't in the active Mods= list
      if (activeSet && !activeSet.has(modId)) {
        modsSkippedInactive++;
        continue;
      }
      modsScanned++;
      modsFoundInThisWs++;
      let totalFileCount = 0;
      for (const mediaPath of mediaPaths) {
        if (indexTruncated) break;
        const { files, truncated } = await walkDir(mediaPath);
        if (truncated) {
          warnings.push(
            `${modName} (${wsId}): file scan hit the 50,000 file limit — some files were skipped`,
          );
        }
        totalFileCount += files.length;
        // Measured (mods-conflict-scan-unmeasured-at-scale): this loop, not
        // walkDir() itself, was the larger event-loop-blocking cost, since
        // the outer per-mod loop only yielded once ALL of a mod's media
        // paths were fully indexed. Same WALK_YIELD_EVERY cadence as
        // walkDir(), so one giant mod can't freeze the panel for the length
        // of its own indexing.
        let sinceYield = 0;
        for (const relFile of files) {
          // Global cap (panel-oom-buildfileindex-unbounded): WALK_MAX_FILES
          // only bounds ONE mod's walk. Without this, fileIndex keeps
          // accumulating entries across every mod combined, unbounded by mod
          // count. Bail out of the whole scan (not just this mod) the
          // moment the cap is hit.
          if (indexedEntries >= maxEntries) {
            indexTruncated = true;
            break outer;
          }
          const normalizedPath = relFile.replace(/\\/g, "/").toLowerCase();
          if (!fileIndex[normalizedPath]) {
            fileIndex[normalizedPath] = [];
          }
          fileIndex[normalizedPath].push({
            workshopId: wsId,
            modId,
            modName,
            absPath: path.join(mediaPath, relFile),
          });
          indexedEntries++;
          if (++sinceYield >= WALK_YIELD_EVERY) {
            sinceYield = 0;
            await yieldTick();
          }
        }
      }
      if (onModScanned)
        onModScanned({
          modId,
          modName,
          workshopId: wsId,
          fileCount: totalFileCount,
          modsScanned,
          totalWorkshopIds,
          wsIdx,
        });
    }
    if (modsFoundInThisWs > 1) {
      log.debug(
        `Workshop ${wsId}: contains ${modsFoundInThisWs} mod dirs (${modInfoMap[wsId]?.map((m) => m.id).join(", ") || "unknown"})`,
      );
    }
    // Yield after each workshop item so SSE writes and incoming requests aren't starved
    await yieldTick();
  }
  if (indexTruncated) {
    // A truncated scan is a wrong answer presented as a complete one unless
    // it says so — both here (a machine-checkable field) and in `warnings`
    // (what the UI already surfaces to the operator).
    warnings.push(
      `File index reached the global ${maxEntries.toLocaleString()}-entry limit — the conflict scan is incomplete. Scan fewer mods at once or remove unused ones and retry.`,
    );
  }
  return {
    fileIndex,
    modInfoMap,
    modsScanned,
    modsNotFound,
    modsSkippedInactive,
    truncated: indexTruncated,
    warnings,
  };
}
