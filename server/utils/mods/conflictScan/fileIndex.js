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
import { walkDir } from "./fsWalk.js";

const log = createLogger("API:Mods");

// ─── Shared scan helpers ────────────────────────────────────────────────────
// Yield to event loop (allows SSE writes, incoming requests, etc.)
export const yieldTick = () => new Promise((resolve) => setImmediate(resolve));

// Max file size to hash (50 MB) — larger files are treated as different
export const HASH_MAX_BYTES = 50 * 1024 * 1024;

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
export async function buildFileIndex(
  workshopIds,
  serverPath,
  onModScanned,
  activeModIds,
) {
  const fileIndex = {};
  const modInfoMap = {};
  let modsScanned = 0;
  let modsNotFound = 0;
  let modsSkippedInactive = 0;
  const warnings = [];
  const totalWorkshopIds = workshopIds.length;
  const activeSet = activeModIds ? new Set(activeModIds) : null;

  for (let wsIdx = 0; wsIdx < totalWorkshopIds; wsIdx++) {
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
        const { files, truncated } = walkDir(mediaPath);
        if (truncated) {
          warnings.push(
            `${modName} (${wsId}): file scan hit the 50,000 file limit — some files were skipped`,
          );
        }
        totalFileCount += files.length;
        for (const relFile of files) {
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
  return {
    fileIndex,
    modInfoMap,
    modsScanned,
    modsNotFound,
    modsSkippedInactive,
    warnings,
  };
}
