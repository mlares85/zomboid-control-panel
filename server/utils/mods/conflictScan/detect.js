import {
  classifyFile,
  SEVERITY_MAP,
  CATEGORY_LABELS,
} from "./fsWalk.js";
import {
  compareTranslationKeys,
  compareScriptDefinitions,
  compareClothingDefinitions,
} from "./definitions.js";
import { compareLuaSymbols, LUA_CATEGORIES } from "./lua.js";
import { dedupeByModId, compareFileContents, yieldTick } from "./fileIndex.js";

// Detect conflicts from a file index. Calls `onConflictFound(conflict)` for each.
export async function detectConflicts(fileIndex, onConflictFound, options = {}) {
  const { shouldAbort, onProgress } = options;
  const conflicts = [];
  let identicalSkipped = 0;
  let additiveSkipped = 0;
  let pzAdditiveSkipped = 0; // PZ-specific additive files (sandbox, scripts, clothing, metadata)
  const pzAdditiveBreakdown = {
    sandbox: 0,
    scripts: 0,
    clothing: 0,
    fileguidtable: 0,
    translate: 0,
  };
  let processed = 0;
  const indexEntries = Object.entries(fileIndex);
  for (const [filePath, mods] of indexEntries) {
    if (shouldAbort && shouldAbort()) break;
    if (mods.length < 2) continue;
    const distinctMods = dedupeByModId(mods);
    if (distinctMods.length < 2) continue;
    const category = classifyFile(filePath);

    // sandbox-options.txt lives at the media root and PZ merges it by named
    // option block; fileGuidTable.xml is mod-editor metadata never loaded at
    // runtime. Both are additive whatever they contain, so skip them before
    // comparing rather than reading 34+ copies only to discard the answer.
    if (category === "sandbox-options" || category === "fileguidtable") {
      pzAdditiveSkipped++;
      pzAdditiveBreakdown[
        category === "sandbox-options" ? "sandbox" : "fileguidtable"
      ]++;
      continue;
    }

    const contentState = await compareFileContents(mods);
    if (++processed % 25 === 0) {
      if (onProgress) onProgress({ processed, total: indexEntries.length });
      await yieldTick();
    }
    // "unknown" means too few copies were readable to conclude anything.
    if (contentState === "unknown") continue;
    if (contentState === "identical") {
      identicalSkipped++;
      continue;
    }

    const conflictMods = distinctMods.map((m) => ({
      workshopId: m.workshopId,
      modId: m.modId,
      modName: m.modName,
    }));

    // ─── PZ additive files: these are NOT real conflicts ───

    // Translation files: mods add their own keys to shared filenames.
    // Only flag as a real conflict when keys actually overlap.
    if (category === "translate") {
      const comparison = compareTranslationKeys(mods);
      if (comparison.disjoint) {
        additiveSkipped++;
        pzAdditiveBreakdown.translate++;
        continue;
      }
      // Keys overlap, or the file could not be parsed — surface as a
      // low-severity conflict with whatever keys were identified.
      const conflict = {
        file: filePath,
        category,
        categoryLabel: CATEGORY_LABELS[category] || category,
        severity: "low",
        identical: false,
        mods: conflictMods,
      };
      if (comparison.overlapping.length > 0) {
        conflict.overlap = {
          kind: "translation-keys",
          items: comparison.overlapping.slice(0, 50),
          total: comparison.overlapping.length,
        };
      }
      conflicts.push(conflict);
      if (onConflictFound) onConflictFound(conflict);
      continue;
    }

    // PZ script files: parse for overlapping module.type.name definitions.
    // PZ loads ALL .txt from every mod's scripts/ and merges them.
    let scriptOverlap = null;
    if (category === "scripts") {
      const comparison = compareScriptDefinitions(mods);
      if (comparison.disjoint) {
        pzAdditiveSkipped++;
        pzAdditiveBreakdown.scripts++;
        continue;
      }
      scriptOverlap = comparison.overlapping;
      // Has overlapping defs — this IS a real conflict
    }

    // Clothing XMLs: PZ merges all clothing definitions from all mods.
    // Only flag if clothing item IDs actually overlap.
    let clothingOverlap = null;
    if (category === "clothing") {
      const comparison = compareClothingDefinitions(mods);
      if (comparison.disjoint) {
        pzAdditiveSkipped++;
        pzAdditiveBreakdown.clothing++;
        continue;
      }
      clothingOverlap = comparison.overlapping;
      // Has overlapping clothing IDs — real conflict
    }

    // Lua: not merged — last-loaded wins. Parse symbol names so the UI can show
    // exactly which functions/events/classes clash vs which are silently shadowed.
    let luaOverlap = null;
    if (LUA_CATEGORIES.has(category)) {
      luaOverlap = compareLuaSymbols(mods); // null when files unparsable / no symbols
    }

    const conflict = {
      file: filePath,
      category,
      categoryLabel: CATEGORY_LABELS[category] || category,
      severity: SEVERITY_MAP[category] || "low",
      identical: false,
      mods: conflictMods,
    };
    if (scriptOverlap && scriptOverlap.length > 0) {
      conflict.overlap = {
        kind: "script-defs",
        items: scriptOverlap.slice(0, 50),
        total: scriptOverlap.length,
      };
    } else if (clothingOverlap && clothingOverlap.length > 0) {
      conflict.overlap = {
        kind: "clothing-items",
        items: clothingOverlap.slice(0, 50),
        total: clothingOverlap.length,
      };
    } else if (luaOverlap) {
      if (luaOverlap.overlapping.length > 0) {
        conflict.overlap = {
          kind: "lua-symbols",
          items: luaOverlap.overlapping.slice(0, 50),
          total: luaOverlap.overlapping.length,
        };
      } else {
        // Lua files at the same path with no overlapping named symbols — one fully
        // shadows the other but they don't fight for the same names. Demote severity.
        conflict.severity = "medium";
        conflict.overlap = { kind: "lua-shadow", items: [], total: 0 };
      }
    }
    conflicts.push(conflict);
    if (onConflictFound) onConflictFound(conflict);
  }
  return {
    conflicts,
    identicalSkipped,
    additiveSkipped,
    pzAdditiveSkipped,
    pzAdditiveBreakdown,
  };
}
