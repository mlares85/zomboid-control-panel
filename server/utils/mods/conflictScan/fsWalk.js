import path from "path";
import fs from "fs";
import { createLogger } from "../../logger.js";

const log = createLogger("API:Mods");

const WALK_MAX_DEPTH = 20;
const WALK_MAX_FILES = 50_000;
const WALK_SKIP_DIRS = new Set([
  ".git",
  ".svn",
  ".hg",
  "__pycache__",
  "node_modules",
  ".vscode",
]);

export function safeRealpath(p) {
  try {
    return fs.realpathSync(p);
  } catch (e) {
    log.debug(`Could not resolve ${p}: ${e.message}`);
    return null;
  }
}

export function isInsideRoot(target, root) {
  return target === root || target.startsWith(root + path.sep);
}

// Recursively collect all files under a directory, returning relative paths.
// Guarded with depth and file-count limits to prevent runaway traversal.
// Returns { files: string[], truncated: boolean }
export function walkDir(dir, prefix = "", _depth = 0, _ctx = null) {
  // The budget is shared across the whole recursion; a per-call limit let a
  // deep tree return many times the intended maximum.
  const ctx = _ctx || { left: WALK_MAX_FILES, root: safeRealpath(dir) || dir };
  const results = [];
  let truncated = false;
  if (_depth > WALK_MAX_DEPTH) return { files: results, truncated };
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    log.debug(`walkDir: could not read ${dir}: ${e.message}`);
    return { files: results, truncated };
  }
  for (const entry of entries) {
    if (ctx.left <= 0) {
      truncated = true;
      break;
    }
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);
    let isDirectory = entry.isDirectory();
    // readdir reports a symlink as its own type, so a linked folder would
    // otherwise be indexed as if it were a file. Resolve it, and refuse
    // anything that escapes the mod's own media tree.
    if (entry.isSymbolicLink()) {
      const real = safeRealpath(fullPath);
      if (!real || !isInsideRoot(real, ctx.root)) continue;
      try {
        isDirectory = fs.statSync(real).isDirectory();
      } catch (e) {
        log.debug(`walkDir: could not stat link ${fullPath}: ${e.message}`);
        continue;
      }
    }
    if (isDirectory) {
      // Skip version-control and metadata directories — never game content
      if (WALK_SKIP_DIRS.has(entry.name.toLowerCase())) continue;
      const sub = walkDir(fullPath, rel, _depth + 1, ctx);
      results.push(...sub.files);
      if (sub.truncated) truncated = true;
    } else {
      ctx.left--;
      results.push(rel);
    }
  }
  return { files: results, truncated };
}

// Classify a file path into a conflict severity category
export function classifyFile(relPath) {
  const lower = relPath.toLowerCase();
  const basename = lower.split("/").pop();

  // ─── Top-level media files (at media/ root) ───
  // sandbox-options.txt: PZ merges option blocks by name — always additive.
  if (basename === "sandbox-options.txt") return "sandbox-options";
  // fileGuidTable.xml: PZ mod editor metadata, never loaded at runtime.
  if (basename === "fileguidtable.xml") return "fileguidtable";

  // ─── Lua scripts ───
  if (lower.startsWith("lua/")) {
    if (lower.startsWith("lua/server/")) return "lua-server";
    if (lower.startsWith("lua/client/")) return "lua-client";
    if (lower.startsWith("lua/shared/translate/")) return "translate";
    if (lower.startsWith("lua/shared/")) return "lua-shared";
    return "lua-other";
  }

  // ─── PZ script definitions ───
  if (lower.startsWith("scripts/")) return "scripts";

  // ─── Clothing definitions ───
  // PZ merges all clothing.xml and clothingitems/*.xml files — each mod defines
  // its own clothing items by unique ID. Only overlapping IDs are real conflicts.
  if (lower.startsWith("clothing/")) return "clothing";

  if (lower.startsWith("maps/")) return "maps";
  if (
    lower.startsWith("texturepacks/") ||
    lower.startsWith("textures/") ||
    lower.endsWith(".pack")
  )
    return "textures";
  if (lower.startsWith("ui/")) return "ui-assets";
  if (lower.startsWith("sound/") || lower.startsWith("music/")) return "audio";
  if (
    lower.startsWith("models/") ||
    lower.startsWith("models_x/") ||
    lower.endsWith(".fbx") ||
    lower.endsWith(".x")
  )
    return "models";
  if (lower.endsWith(".png") || lower.endsWith(".jpg")) return "textures";
  if (lower.endsWith(".xml") || lower.endsWith(".txt")) return "data";
  return "other";
}

export const SEVERITY_MAP = {
  "lua-server": "high",
  "lua-shared": "high",
  "lua-client": "high",
  "lua-other": "high",
  "lua-cross-file": "high",
  scripts: "medium",
  clothing: "medium",
  "sandbox-options": "low",
  fileguidtable: "low",
  translate: "low",
  maps: "medium",
  textures: "low",
  "ui-assets": "low",
  models: "low",
  audio: "low",
  data: "medium",
  other: "low",
};

export const CATEGORY_LABELS = {
  "lua-server": "Server Lua Scripts",
  "lua-shared": "Shared Lua Scripts",
  "lua-client": "Client Lua Scripts",
  "lua-other": "Lua Scripts",
  "lua-cross-file": "Lua Symbol Clash (same workshop, different files)",
  scripts: "Item/Recipe/Vehicle Scripts",
  clothing: "Clothing Definitions",
  "sandbox-options": "Sandbox Options",
  fileguidtable: "Mod Editor Metadata",
  translate: "Translation Files",
  maps: "Map Data",
  textures: "Texture Packs",
  "ui-assets": "UI Assets",
  models: "3D Models",
  audio: "Audio",
  data: "Data Files",
  other: "Other Files",
};
