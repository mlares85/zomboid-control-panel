import express from "express";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import { getServerPath } from "../../../utils/mods/serverConfig.js";
import {
  acquireScanLock,
  releaseScanLock,
  getCachedScan,
  setCachedScan,
  SCAN_CACHE_TTL_MS,
} from "../../../utils/mods/conflictScan/state.js";
import { readIniModLists, buildFileIndex } from "../../../utils/mods/conflictScan/fileIndex.js";
import { detectConflicts } from "../../../utils/mods/conflictScan/detect.js";
import { detectSameWorkshopLuaSymbolConflicts } from "../../../utils/mods/conflictScan/crossFileLua.js";
import {
  groupIntoPairs,
  annotateWinners,
  findIdCollisions,
  findMissingDeps,
} from "../../../utils/mods/conflictScan/pairs.js";
import { findSteamDeps } from "../../../utils/mods/conflictScan/steamDeps.js";
import { resetScanCaches } from "../../../utils/mods/conflictScan/lua.js";

const log = createLogger("API:Mods");
const router = express.Router();

// ─── Cached scan result endpoint ─────────────────────────────────────────────
// Returns the last scan result without re-running the scan.
router.get("/conflicts/cached", async (req, res) => {
  const cached = getCachedScan();
  if (!cached.result || Date.now() - cached.timestamp > SCAN_CACHE_TTL_MS) {
    return res.json(null);
  }
  // Check if config has changed since last scan
  try {
    const { workshopIds, modIdsFromIni } = await readIniModLists();
    const currentServerPath = await getServerPath();
    const currentWsSnapshot = workshopIds.slice().sort().join(",");
    const currentModSnapshot = modIdsFromIni.slice().sort().join(",");
    const stale =
      currentWsSnapshot !== cached.workshopSnapshot ||
      currentModSnapshot !== cached.modSnapshot ||
      currentServerPath !== cached.serverPath;
    res.json({
      ...cached.result,
      stale,
      _workshopIdsSnapshot: cached.workshopSnapshot
        ? cached.workshopSnapshot.split(",")
        : [],
      _modIdsSnapshot: cached.modSnapshot ? cached.modSnapshot.split(",") : [],
    });
  } catch (e) {
    log.debug(`Error checking scan staleness (marking stale): ${e.message}`);
    res.json({ ...cached.result, stale: true });
  }
});

// ─── Batch scan endpoint (for non-SSE clients) ──────────────────────────────
router.get("/conflicts", async (req, res) => {
  const lockToken = acquireScanLock();
  if (!lockToken) {
    return res
      .status(429)
      .json({ error: "A conflict scan is already running. Please wait." });
  }
  const scanStart = Date.now();
  try {
    const serverPath = await getServerPath();
    if (!serverPath)
      return res.status(400).json({
        error: "Server install path not set — configure it in Servers > Edit",
        fixUrl: "/servers",
      });
    const { workshopIds, modIdsFromIni } = await readIniModLists();
    if (workshopIds.length === 0) {
      return res.json({
        totalConflicts: 0,
        identicalSkipped: 0,
        additiveSkipped: 0,
        pzAdditiveSkipped: 0,
        pzAdditiveBreakdown: {
          sandbox: 0,
          scripts: 0,
          clothing: 0,
          fileguidtable: 0,
          translate: 0,
        },
        pairs: [],
        totalPairs: 0,
        modsScanned: 0,
        missingDeps: [],
        modLoadOrder: modIdsFromIni,
        truncated: false,
        warnings: [],
        scanDurationMs: Date.now() - scanStart,
      });
    }
    const {
      fileIndex,
      modInfoMap,
      modsScanned,
      modsNotFound,
      modsSkippedInactive,
      truncated,
      warnings,
    } = await buildFileIndex(workshopIds, serverPath, null, modIdsFromIni);
    const {
      conflicts,
      identicalSkipped,
      additiveSkipped,
      pzAdditiveSkipped,
      pzAdditiveBreakdown,
    } = await detectConflicts(fileIndex);
    // Second pass: catch variant-bundle clashes (NUDE/DOLL/Tex etc.) where
    // two mod IDs in the same workshop redefine the same Lua names from
    // different filenames. These slip past the per-file pass.
    const crossFileConflicts = await detectSameWorkshopLuaSymbolConflicts(
      fileIndex,
      conflicts,
    );
    if (crossFileConflicts.length > 0) conflicts.push(...crossFileConflicts);
    annotateWinners(conflicts, modIdsFromIni);
    const idCollisions = findIdCollisions(modInfoMap, modIdsFromIni);
    const severityOrder = { high: 0, medium: 1, low: 2 };
    conflicts.sort(
      (a, b) =>
        (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3) ||
        a.file.localeCompare(b.file),
    );
    const pairs = groupIntoPairs(conflicts);
    const missingDeps = findMissingDeps(modInfoMap, modIdsFromIni, serverPath);
    let steamDeps = [];
    try {
      const steamResult = await findSteamDeps(workshopIds);
      steamDeps = steamResult.deps;
      warnings.push(...steamResult.warnings);
    } catch (e) {
      log.debug(
        `Steam deps lookup failed during batch scan (non-fatal): ${e.message}`,
      );
    }
    const result = {
      totalConflicts: conflicts.length,
      identicalSkipped,
      additiveSkipped,
      pzAdditiveSkipped,
      pzAdditiveBreakdown,
      pairs,
      totalPairs: pairs.length,
      modsScanned,
      modsNotFound,
      modsSkippedInactive,
      totalWorkshopIds: workshopIds.length,
      missingDeps,
      steamDeps,
      idCollisions,
      modLoadOrder: modIdsFromIni,
      truncated,
      warnings,
      scanDurationMs: Date.now() - scanStart,
    };
    setCachedScan({
      result,
      workshopSnapshot: workshopIds.slice().sort().join(","),
      modSnapshot: modIdsFromIni?.slice().sort().join(",") || null,
      serverPath,
    });
    res.json(result);
  } catch (error) {
    log.error(`Failed to scan mod conflicts: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  } finally {
    resetScanCaches();
    releaseScanLock(lockToken);
  }
});

export default router;
