import express from "express";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import { getServerPath } from "../../../utils/mods/serverConfig.js";
import {
  acquireScanLock,
  releaseScanLock,
  setCachedScan,
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

// ─── SSE streaming scan endpoint ────────────────────────────────────────────
// Streams progress events as each mod is scanned and conflicts are found.
// Auth handled via ?token= query param (SSE can't set custom headers).
router.get("/conflicts/stream", async (req, res) => {
  const lockToken = acquireScanLock();
  if (!lockToken) {
    return res
      .status(429)
      .json({ error: "A conflict scan is already running. Please wait." });
  }
  const scanStart = Date.now();

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable nginx buffering if proxied
  });
  res.flushHeaders();

  // Detect client disconnect
  let aborted = false;
  req.on("close", () => {
    aborted = true;
  });

  const send = (event, data) => {
    if (!res.writable || aborted) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      log.debug(`SSE write failed (stream closed): ${e.message}`);
    }
  };

  // A large scan can spend a long time in one phase. Without traffic a proxy
  // is free to drop the connection, so emit an SSE comment as a keep-alive.
  const heartbeat = setInterval(() => {
    if (!res.writable || aborted) return;
    try {
      res.write(": ping\n\n");
    } catch (e) {
      log.debug(`SSE heartbeat failed (stream closed): ${e.message}`);
    }
  }, 20_000);
  heartbeat.unref?.();

  try {
    const serverPath = await getServerPath();
    if (!serverPath) {
      send("error", {
        error: "Server install path not set — configure it in Settings",
      });
      res.end();
      return;
    }
    const { workshopIds, modIdsFromIni } = await readIniModLists();

    send("init", {
      totalWorkshopIds: workshopIds.length,
      modLoadOrder: modIdsFromIni,
    });

    if (workshopIds.length === 0) {
      send("complete", {
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
        totalWorkshopIds: 0,
        missingDeps: [],
        modLoadOrder: modIdsFromIni,
        warnings: [],
        scanDurationMs: Date.now() - scanStart,
      });
      res.end();
      return;
    }

    // Phase 1: scan mods — emit progress per mod
    const {
      fileIndex,
      modInfoMap,
      modsScanned,
      modsNotFound,
      modsSkippedInactive,
      warnings,
    } = await buildFileIndex(
      workshopIds,
      serverPath,
      (info) => {
        if (aborted) return;
        send("mod-scanned", {
          modId: info.modId,
          modName: info.modName,
          workshopId: info.workshopId,
          fileCount: info.fileCount,
          modsScanned: info.modsScanned,
          totalWorkshopIds: info.totalWorkshopIds,
          progress: Math.round(((info.wsIdx + 1) / info.totalWorkshopIds) * 60), // 0-60%
        });
      },
      modIdsFromIni,
    );

    if (aborted) {
      res.end();
      return;
    }
    send("phase", { phase: "hashing", progress: 60 });

    // Phase 2: detect conflicts (hashing happens here)
    let conflictCount = 0;
    const {
      conflicts,
      identicalSkipped,
      additiveSkipped,
      pzAdditiveSkipped,
      pzAdditiveBreakdown,
    } = await detectConflicts(
      fileIndex,
      (conflict) => {
        if (aborted) return;
        conflictCount++;
        // Stream each conflict as it's found (every 3rd to avoid flooding, or always for high severity)
        if (
          conflict.severity === "high" ||
          conflictCount <= 5 ||
          conflictCount % 3 === 0
        ) {
          send("conflict-found", {
            file: conflict.file,
            severity: conflict.severity,
            categoryLabel: conflict.categoryLabel,
            mods: conflict.mods.map((m) => m.modName),
            conflictsSoFar: conflictCount,
          });
        }
      },
      {
        // Stop the scan when the client has gone: comparing files for a
        // browser that closed the tab is pure wasted I/O.
        shouldAbort: () => aborted,
        // Comparison used to be a silent gap between 60% and 85%.
        onProgress: ({ processed, total }) => {
          if (aborted || total === 0) return;
          send("phase", {
            phase: "hashing",
            progress: 60 + Math.round((processed / total) * 25),
          });
        },
      },
    );

    if (aborted) {
      res.end();
      return;
    }
    send("phase", { phase: "grouping", progress: 85 });

    // Second pass: catch variant-bundle clashes within the same workshop
    // where mod IDs redefine the same Lua names from different filenames.
    const crossFileConflicts = await detectSameWorkshopLuaSymbolConflicts(
      fileIndex,
      conflicts,
      (conflict) => {
        if (aborted) return;
        conflictCount++;
        send("conflict-found", {
          file: conflict.file,
          severity: conflict.severity,
          categoryLabel: conflict.categoryLabel,
          mods: conflict.mods.map((m) => m.modName),
          conflictsSoFar: conflictCount,
        });
      },
      { shouldAbort: () => aborted },
    );
    if (crossFileConflicts.length > 0) conflicts.push(...crossFileConflicts);

    // Phase 3: group & sort
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

    // Phase 4: Steam API dependency check (parallel-safe, non-blocking)
    let steamDeps = [];
    try {
      if (!aborted) {
        send("phase", { phase: "dependencies", progress: 90 });
        const steamResult = await findSteamDeps(workshopIds);
        steamDeps = steamResult.deps;
        warnings.push(...steamResult.warnings);
      }
    } catch (e) {
      log.debug(
        `Steam deps lookup failed during SSE scan (non-fatal): ${e.message}`,
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
      warnings,
      scanDurationMs: Date.now() - scanStart,
    };
    setCachedScan({
      result,
      workshopSnapshot: workshopIds.slice().sort().join(","),
      modSnapshot: modIdsFromIni.slice().sort().join(","),
      serverPath,
    });
    send("complete", result);
    res.end();
  } catch (error) {
    log.error(`Streaming conflict scan failed: ${error.message}`);
    if (!aborted) {
      send("error", { error: sanitizeError(error.message) });
      res.end();
    }
  } finally {
    clearInterval(heartbeat);
    resetScanCaches();
    releaseScanLock(lockToken);
  }
});

export default router;
