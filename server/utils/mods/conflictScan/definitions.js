import fs from "fs";
import { createLogger } from "../../logger.js";
import { stripBom } from "../iniFile.js";

const log = createLogger("API:Mods");

// ─── Translation file key extraction ────────────────────────────────────────
// PZ translation files are Lua tables with `KEY = "value"` entries.
// Multiple mods can each add their own keys to the same file name — only
// overlapping keys represent a real conflict.
function extractTranslationKeys(filePath) {
  try {
    const content = stripBom(fs.readFileSync(filePath, "utf-8"));
    const keys = new Set();
    // Match lines like:   IGUI_perks_Lightfoot = "靈巧",
    // The value must look like a string ("..." or '...' or [[...]]).
    // This skips the wrapping table declaration `IGUI_EN = {` (false-positive
    // source: every translation file has one and the names sometimes match).
    const re = /^\s*([A-Za-z_]\w*)\s*=\s*(?:"|'|\[\[)/gm;
    let m;
    while ((m = re.exec(content)) !== null) keys.add(m[1]);
    return keys;
  } catch (e) {
    log.debug(`Error parsing translation file ${filePath}: ${e.message}`);
    return null;
  }
}

// Compare per-mod definition sets for one shared file path.
// `extract` returns a Set of names, or null when the file could not be parsed.
// The two cases are deliberately different: a file that parsed to zero
// definitions genuinely cannot collide with anything, while a file that failed
// to parse tells us nothing and must fail closed so a parser limitation never
// hides a real clash.
// Returns { disjoint, overlapping, inconclusive }.
export function compareDefinitionSets(modEntries, extract) {
  const parsed = [];
  let unparsable = 0;
  for (const entry of modEntries) {
    const defs = extract(entry.absPath);
    if (!defs) {
      unparsable++;
      continue;
    }
    parsed.push({ mod: entry, defs });
  }
  const overlapping = new Set();
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      if (parsed[i].mod.modId === parsed[j].mod.modId) continue;
      // Iterate the smaller set so the cost tracks the cheaper file.
      const [small, large] =
        parsed[i].defs.size <= parsed[j].defs.size
          ? [parsed[i].defs, parsed[j].defs]
          : [parsed[j].defs, parsed[i].defs];
      for (const d of small) if (large.has(d)) overlapping.add(d);
    }
  }
  if (overlapping.size > 0) {
    return {
      disjoint: false,
      overlapping: [...overlapping],
      inconclusive: false,
    };
  }
  const distinctParsedMods = new Set(parsed.map((p) => p.mod.modId)).size;
  const inconclusive = unparsable > 0 || distinctParsedMods < 2;
  return { disjoint: !inconclusive, overlapping: [], inconclusive };
}

// Compare keys from multiple mod versions of the same translation file.
// Returns { disjoint: true } if no keys overlap (additive — not a real conflict),
// or { disjoint: false, overlapping: [...] } if keys collide or cannot be read.
export function compareTranslationKeys(modEntries) {
  return compareDefinitionSets(modEntries, extractTranslationKeys);
}

// ─── PZ script file parsing ─────────────────────────────────────────────────
// PZ script files (scripts/*.txt) contain blocks like:
//   module Base { item BaseballBat { ... } recipe CraftBat { ... } }
// PZ loads ALL .txt files from every mod's scripts/ folder and merges them.
// Two mods with the same filename but DIFFERENT module.type.name definitions
// are additive (not conflicting). Only overlapping definitions are real conflicts.
function extractScriptDefinitions(filePath) {
  try {
    const content = stripBom(fs.readFileSync(filePath, "utf-8"));
    if (content.length > 2 * 1024 * 1024) return null; // skip huge files
    const defs = new Set();
    // Match: module ModuleName { ... }
    const moduleRe = /module\s+(\w+)\s*\{/g;
    let moduleMatch;
    while ((moduleMatch = moduleRe.exec(content)) !== null) {
      const moduleName = moduleMatch[1];
      const moduleStart = moduleMatch.index + moduleMatch[0].length;
      // Find the matching closing brace for this module block
      let depth = 1;
      let pos = moduleStart;
      while (pos < content.length && depth > 0) {
        if (content[pos] === "{") depth++;
        else if (content[pos] === "}") depth--;
        pos++;
      }
      const moduleBody = content.slice(moduleStart, pos - 1);
      // Extract top-level definitions. B41 + B42 keywords (B42 adds craftRecipe, entity,
      // xuiSkin, componentTemplate, bodyLocation, wallpaper, material, etc.).
      const defRe =
        /^\s*(item|recipe|craftrecipe|vehicle|fixing|model|sound|animation|mannequin|evolvedrecipe|uniquerecipe|multistagebuild|entity|xuiskin|componenttemplate|bodylocation|wallpaper|material|template|electrical|liquid|liquidvacuumdef|stash|profession|trait|bodypart)\s+(\S+)/gim;
      let defMatch;
      while ((defMatch = defRe.exec(moduleBody)) !== null) {
        defs.add(`${moduleName}.${defMatch[1].toLowerCase()}.${defMatch[2]}`);
      }
    }
    return defs;
  } catch (e) {
    log.debug(`Error parsing script file ${filePath}: ${e.message}`);
    return null;
  }
}

// Compare script definitions from multiple mod versions of the same file.
// Returns { disjoint: true } if no definitions overlap (additive),
// or { disjoint: false, overlapping: [...] } if definitions collide.
export function compareScriptDefinitions(modEntries) {
  return compareDefinitionSets(modEntries, extractScriptDefinitions);
}

// ─── Clothing XML parsing ───────────────────────────────────────────────────
// PZ clothing files (clothing/clothing.xml, clothing/clothingitems/*.xml) are
// additive: PZ loads all such files from every mod and merges by item name.
// Two mods defining the same clothing item ID is a real conflict; different IDs
// are harmless. PZ uses `m_MaleModel`/`m_FemaleModel` as the unique identifier.
function extractClothingDefinitions(filePath) {
  try {
    const content = stripBom(fs.readFileSync(filePath, "utf-8"));
    if (content.length > 2 * 1024 * 1024) return null;
    const defs = new Set();
    // Match XML tags like <m_MaleModel>ItemName</m_MaleModel> or <m_FemaleModel>ItemName</m_FemaleModel>
    const modelRe =
      /<m_(?:Male|Female)Model>\s*([^<]+)\s*<\/m_(?:Male|Female)Model>/gi;
    let m;
    while ((m = modelRe.exec(content)) !== null) {
      defs.add(m[1].trim().toLowerCase());
    }
    // Also match <m_Name> for clothingitems XML format
    const nameRe = /<m_Name>\s*([^<]+)\s*<\/m_Name>/gi;
    while ((m = nameRe.exec(content)) !== null) {
      defs.add(m[1].trim().toLowerCase());
    }
    return defs;
  } catch (e) {
    log.debug(`Error parsing clothing file ${filePath}: ${e.message}`);
    return null;
  }
}

export function compareClothingDefinitions(modEntries) {
  return compareDefinitionSets(modEntries, extractClothingDefinitions);
}
