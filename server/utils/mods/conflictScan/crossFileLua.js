import { classifyFile, CATEGORY_LABELS } from "./fsWalk.js";
import { getLuaSymbols, LUA_CATEGORIES } from "./lua.js";
import { yieldTick } from "./fileIndex.js";

// Detect Lua symbol clashes across DIFFERENT files between mod IDs that ship
// inside the SAME workshop item. The per-file scanner only catches
// collisions when two mods place a file at the same relative path. Many
// "variant bundles" (e.g. TombBodyTexNUDE / TombBodyTexDOLL, Backpacks+
// "Lite" vs "Full") use unique filenames but redefine the same Lua names,
// which would silently overwrite each other at runtime. This pass surfaces
// those so the existing same-workshop "File conflict — pick one" UI fires.
//
// Skips pairs that already produced a same-path conflict in the per-file
// pass (avoids duplicate UI rows). Only Lua categories are considered.
export async function detectSameWorkshopLuaSymbolConflicts(
  fileIndex,
  existingConflicts,
  onConflictFound,
  options = {},
) {
  const { shouldAbort } = options;
  // Build set of (modId|modId) pairs already covered by the per-file pass.
  const coveredPairs = new Set();
  for (const c of existingConflicts) {
    const ids = [...new Set(c.mods.map((m) => m.modId))].sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        coveredPairs.add(`${ids[i]}|${ids[j]}`);
      }
    }
  }

  // Group lua files by workshopId → modId.
  // { wsId: { modId: [{relPath, absPath, modName}] } }
  const wsModFiles = {};
  for (const [relPath, mods] of Object.entries(fileIndex)) {
    if (!LUA_CATEGORIES.has(classifyFile(relPath))) continue;
    for (const m of mods) {
      if (!wsModFiles[m.workshopId]) wsModFiles[m.workshopId] = {};
      if (!wsModFiles[m.workshopId][m.modId])
        wsModFiles[m.workshopId][m.modId] = [];
      wsModFiles[m.workshopId][m.modId].push({
        relPath,
        absPath: m.absPath,
        modName: m.modName,
      });
    }
  }

  const conflicts = [];
  let scanned = 0;
  let parsed = 0;
  for (const [wsId, modFilesMap] of Object.entries(wsModFiles)) {
    if (shouldAbort && shouldAbort()) break;
    const modIds = Object.keys(modFilesMap);
    if (modIds.length < 2) continue;

    // Build per-modId symbol union with first-seen file per symbol (for display).
    // modId → Map<symbol, { relPath, modName }>
    const symsByMod = {};
    for (const modId of modIds) {
      const symMap = new Map();
      for (const f of modFilesMap[modId]) {
        // Reads and parses are the expensive part of this pass, so yield here
        // too — yielding only in the pair loop below left the event loop
        // blocked for the whole extraction phase.
        if (++parsed % 50 === 0) await yieldTick();
        const syms = getLuaSymbols(f.absPath);
        if (!syms || syms.size === 0) continue;
        for (const s of syms) {
          if (!symMap.has(s))
            symMap.set(s, { relPath: f.relPath, modName: f.modName });
        }
      }
      symsByMod[modId] = symMap;
    }

    // Pairwise overlap detection.
    for (let i = 0; i < modIds.length; i++) {
      for (let j = i + 1; j < modIds.length; j++) {
        const idA = modIds[i],
          idB = modIds[j];
        const pairKey = [idA, idB].sort().join("|");
        if (coveredPairs.has(pairKey)) continue;
        const symsA = symsByMod[idA];
        const symsB = symsByMod[idB];
        if (!symsA || !symsB || symsA.size === 0 || symsB.size === 0) continue;

        const overlap = [];
        for (const s of symsA.keys()) {
          if (symsB.has(s)) overlap.push(s);
        }
        if (overlap.length === 0) continue;

        const firstSym = overlap[0];
        const fileA = symsA.get(firstSym);
        const fileB = symsB.get(firstSym);
        const conflict = {
          // Synthetic file label that shows BOTH source files so the UI
          // makes the situation legible. groupIntoPairs treats this as one
          // "file" entry for the pair.
          file:
            fileA.relPath === fileB.relPath
              ? fileA.relPath
              : `${fileA.relPath} ↔ ${fileB.relPath}`,
          category: "lua-cross-file",
          categoryLabel: CATEGORY_LABELS["lua-cross-file"],
          severity: "high",
          identical: false,
          crossFile: true,
          overlap: {
            kind: "lua-symbols",
            items: overlap.slice(0, 50),
            total: overlap.length,
          },
          mods: [
            { workshopId: wsId, modId: idA, modName: fileA.modName },
            { workshopId: wsId, modId: idB, modName: fileB.modName },
          ],
        };
        conflicts.push(conflict);
        if (onConflictFound) onConflictFound(conflict);
        if (++scanned % 20 === 0) await yieldTick();
      }
    }
  }
  return conflicts;
}
