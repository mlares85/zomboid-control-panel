import fs from "fs";
import { createLogger } from "../../logger.js";
import { stripBom } from "../iniFile.js";

const log = createLogger("API:Mods");

// ─── Lua symbol extraction ──────────────────────────────────────────────────
// PZ does NOT merge Lua files: when two mods ship the same lua/.../foo.lua,
// the last-loaded one wins outright and the loser is discarded entirely.
// We extract the *names* both files define so the UI can show what would clash
// vs what would merely be shadowed:
//   fn:Foo.bar          — function declarations  (function Foo:bar / Foo.bar / function bar)
//   event:OnPlayerMove  — Events.X.Add subscriptions
//   class:ISFoo         — ISClass:derive("ISFoo") declarations
//   tbl:Foo             — top-level table assigns (Foo = {...})
function extractLuaSymbols(filePath) {
  try {
    const content = stripBom(fs.readFileSync(filePath, "utf-8"));
    if (content.length > 2 * 1024 * 1024) return null;
    // Strip --[[ block comments ]] and -- line comments to avoid false positives
    const stripped = content
      .replace(/--\[\[[\s\S]*?\]\]/g, "")
      .replace(/--[^\n]*/g, "");
    const symbols = new Set();
    let m;
    // function Foo:bar(...)  |  function Foo.bar.baz(...)  |  function bar(...)
    const fnRe = /(?:^|\n)\s*(?:local\s+)?function\s+([A-Za-z_][\w.:]*)\s*\(/g;
    while ((m = fnRe.exec(stripped)) !== null) symbols.add(`fn:${m[1]}`);
    // X.Y = function(...)
    const assignFnRe = /(?:^|\n)\s*([A-Za-z_][\w.]*)\s*=\s*function\s*\(/g;
    while ((m = assignFnRe.exec(stripped)) !== null) symbols.add(`fn:${m[1]}`);
    // Events.OnPlayerMove.Add(...)  /  .Remove(...)
    const evRe = /\bEvents\.([A-Za-z_]\w*)\.(?:Add|Remove)\s*\(/g;
    while ((m = evRe.exec(stripped)) !== null) symbols.add(`event:${m[1]}`);
    // ISFoo = ISBar:derive("ISFoo")  — class declarations
    const classRe =
      /(?:^|\n)\s*([A-Z][\w]*)\s*=\s*[A-Z][\w]*\s*:\s*derive\s*\(/g;
    while ((m = classRe.exec(stripped)) !== null) symbols.add(`class:${m[1]}`);
    return symbols;
  } catch (e) {
    log.debug(`Error parsing Lua file ${filePath}: ${e.message}`);
    return null;
  }
}

// Lua files are read by both the per-path pass and the cross-file pass. The
// scan mutex guarantees one scan at a time, so a module-level cache is safe and
// halves the Lua parsing work. Cleared at the end of every scan.
const LUA_SYMBOL_CACHE_MAX = 20_000;
const luaSymbolCache = new Map();

export function getLuaSymbols(filePath) {
  const cached = luaSymbolCache.get(filePath);
  if (cached !== undefined) return cached;
  const symbols = extractLuaSymbols(filePath);
  if (luaSymbolCache.size < LUA_SYMBOL_CACHE_MAX)
    luaSymbolCache.set(filePath, symbols);
  return symbols;
}

export function resetScanCaches() {
  luaSymbolCache.clear();
}

// Compare Lua files at the same path across multiple mods.
// Returns { overlapping: [...], parsed: number } or null when nothing parsable.
export function compareLuaSymbols(modEntries) {
  const symsByMod = [];
  for (const entry of modEntries) {
    const s = getLuaSymbols(entry.absPath);
    if (!s || s.size === 0) continue;
    symsByMod.push({ mod: entry, symbols: s });
  }
  if (symsByMod.length < 2) return null;
  const overlapping = new Set();
  for (let i = 0; i < symsByMod.length; i++) {
    for (let j = i + 1; j < symsByMod.length; j++) {
      if (symsByMod[i].mod.modId === symsByMod[j].mod.modId) continue;
      for (const s of symsByMod[i].symbols)
        if (symsByMod[j].symbols.has(s)) overlapping.add(s);
    }
  }
  return { overlapping: [...overlapping], parsed: symsByMod.length };
}

export const LUA_CATEGORIES = new Set([
  "lua-server",
  "lua-shared",
  "lua-client",
  "lua-other",
]);
