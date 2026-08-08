import path from "path";
import fs from "fs";
import { createLogger } from "../../logger.js";
import { getModDetailsFromWorkshop } from "../workshopModInfo.js";

const log = createLogger("API:Mods");

// Group flat conflict list into mod pairs
export function groupIntoPairs(conflicts) {
  const pairConflicts = {};
  for (const conflict of conflicts) {
    // Deduplicate first: a repeated mod ID would otherwise produce an "A vs A"
    // self-pair and double-count every real pair it appears in.
    const modIds = [...new Set(conflict.mods.map((m) => m.modId))].sort();
    for (let i = 0; i < modIds.length; i++) {
      for (let j = i + 1; j < modIds.length; j++) {
        const pairKey = `${modIds[i]}|${modIds[j]}`;
        if (!pairConflicts[pairKey]) {
          pairConflicts[pairKey] = {
            modA: conflict.mods.find((m) => m.modId === modIds[i]),
            modB: conflict.mods.find((m) => m.modId === modIds[j]),
            files: [],
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            aWins: 0,
            bWins: 0,
            thirdPartyWins: 0,
            unknownWins: 0,
          };
        }
        pairConflicts[pairKey].files.push({
          file: conflict.file,
          category: conflict.category,
          categoryLabel: conflict.categoryLabel,
          severity: conflict.severity,
          winner: conflict.winner || null,
          overlap: conflict.overlap || null,
        });
        const severityKey = `${conflict.severity}Count`;
        if (severityKey in pairConflicts[pairKey])
          pairConflicts[pairKey][severityKey]++;
        // Per-file winner tally for the pair card
        if (conflict.winner == null) pairConflicts[pairKey].unknownWins++;
        else if (conflict.winner.modId === modIds[i])
          pairConflicts[pairKey].aWins++;
        else if (conflict.winner.modId === modIds[j])
          pairConflicts[pairKey].bWins++;
        else pairConflicts[pairKey].thirdPartyWins++;
      }
    }
  }
  return Object.values(pairConflicts).sort(
    (a, b) =>
      b.highCount - a.highCount ||
      b.mediumCount - a.mediumCount ||
      b.files.length - a.files.length,
  );
}

// Annotate each conflict with the winning mod, based on the `Mods=` load order.
// PZ loads mods left-to-right; later entries override earlier ones, so the highest
// index in modLoadOrder wins. Conflicts where neither mod is in the list (rare,
// e.g., the multi-mod-id workshop case) get `winner: null`.
export function annotateWinners(conflicts, modLoadOrder) {
  const order = new Map(modLoadOrder.map((id, i) => [id, i]));
  for (const c of conflicts) {
    let bestIdx = -1;
    let winner = null;
    for (const m of c.mods) {
      const idx = order.get(m.modId);
      if (idx == null) continue;
      if (idx > bestIdx) {
        bestIdx = idx;
        winner = m;
      }
    }
    c.winner = winner
      ? {
          modId: winner.modId,
          modName: winner.modName,
          workshopId: winner.workshopId,
        }
      : null;
  }
}

// Detect cases where multiple workshop items declare the same internal mod id.
// PZ loads only one of them (whichever is listed first / found first), the others
// are silently ignored. Highly common cause of "my mod isn't working" issues.
export function findIdCollisions(modInfoMap, modIdsFromIni) {
  const activeSet = new Set(modIdsFromIni);
  const byModId = new Map();
  for (const [wsId, details] of Object.entries(modInfoMap)) {
    for (const mod of details) {
      if (!byModId.has(mod.id)) byModId.set(mod.id, []);
      byModId.get(mod.id).push({
        workshopId: wsId,
        modName: mod.name,
        active: activeSet.has(mod.id),
      });
    }
  }
  const collisions = [];
  for (const [modId, sources] of byModId.entries()) {
    // Distinct workshop IDs declaring the same mod id
    const distinctWs = [
      ...new Map(sources.map((s) => [s.workshopId, s])).values(),
    ];
    if (distinctWs.length > 1) {
      collisions.push({
        modId,
        active: distinctWs.some((s) => s.active),
        sources: distinctWs,
      });
    }
  }
  return collisions;
}

// Compute missing dependencies, then try to resolve each to a workshop ID by scanning all downloaded folders
export function findMissingDeps(modInfoMap, modIdsFromIni, serverPath) {
  const activeModSet = new Set(modIdsFromIni);
  const dependencies = {};
  for (const [wsId, details] of Object.entries(modInfoMap)) {
    for (const mod of details) {
      // Only check deps for mods actually active in the Mods= INI line
      if (mod.require?.length > 0 && activeModSet.has(mod.id)) {
        dependencies[mod.id] = {
          modId: mod.id,
          modName: mod.name,
          workshopId: wsId,
          requires: mod.require,
        };
      }
    }
  }
  // Vanilla PZ modules — always available, never in WorkshopItems. Both B41 and B42
  // module names included (some mods reference lowercase variants).
  const builtInMods = new Set([
    "Base",
    "base",
    "Farming",
    "Radio",
    "Camping",
    "Trapping",
    "Fishing",
    "Foraging",
    "Erosion",
    // B42 additions
    "Animal",
    "NPCs",
    "Seasons",
    "FireFighting",
    "FeedingTrough",
    "RainBarrel",
    "Vehicles",
    "Zombies",
    "XpSystem",
    "HealthSystem",
    "Professions",
    "Climate",
  ]);
  const allModIds = new Set(builtInMods);
  for (const id of modIdsFromIni) allModIds.add(id);
  const missingDeps = [];
  for (const [modId, depInfo] of Object.entries(dependencies)) {
    for (const req of depInfo.requires) {
      if (allModIds.has(req)) continue;
      // Accept variant IDs of the same mod (e.g. require=AZASFrequencyIndex satisfied by
      // AZASFrequencyIndex_RefactorTest). Modders use "<id>_<suffix>" for test/beta/legacy
      // forks shipped from the same Workshop item. Case-insensitive to be forgiving.
      const reqLower = req.toLowerCase();
      const variantMatch = Array.from(allModIds).find((id) => {
        const lower = id.toLowerCase();
        return (
          lower.startsWith(reqLower + "_") || lower.startsWith(reqLower + "-")
        );
      });
      if (variantMatch) continue;
      missingDeps.push({
        modId,
        modName: depInfo.modName,
        workshopId: depInfo.workshopId,
        missingDep: req,
      });
    }
  }

  // Resolve missing deps to workshop IDs by scanning ALL downloaded workshop folders on disk
  if (serverPath && missingDeps.length > 0) {
    const missingIds = new Set(missingDeps.map((d) => d.missingDep));
    const resolved = new Map(); // modId → { workshopId, modName }
    const workshopPaths = [
      path.join(serverPath, "steamapps", "workshop", "content", "108600"),
      path.join(serverPath, "..", "steamapps", "workshop", "content", "108600"),
    ];
    for (const workshopBase of workshopPaths) {
      if (!fs.existsSync(workshopBase)) continue;
      try {
        for (const entry of fs.readdirSync(workshopBase, {
          withFileTypes: true,
        })) {
          if (!entry.isDirectory() || resolved.size === missingIds.size)
            continue;
          try {
            const details = getModDetailsFromWorkshop(entry.name, serverPath);
            for (const mod of details) {
              if (missingIds.has(mod.id) && !resolved.has(mod.id)) {
                resolved.set(mod.id, {
                  workshopId: entry.name,
                  modName: mod.name,
                });
              }
            }
          } catch (e) {
            log.debug(`Workshop folder unreadable ${entry.name}: ${e.message}`);
          }
        }
      } catch (e) {
        log.debug(`Workshop path inaccessible: ${e.message}`);
      }
      if (resolved.size === missingIds.size) break;
    }
    // Annotate missing deps with resolved workshop IDs
    for (const dep of missingDeps) {
      const match = resolved.get(dep.missingDep);
      if (match) {
        dep.resolvedWorkshopId = match.workshopId;
        dep.resolvedModName = match.modName;
      }
    }
  }

  return missingDeps;
}
