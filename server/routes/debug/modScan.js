import fs from "fs";
import path from "path";
import { safeReaddir, safeStat } from "./fsProbe.js";

// Parse a PZ dedicated-server .ini. PZ uses `key=value` lines and
// semicolon-separated lists for Mods / WorkshopItems / Map. Returns
// null when the file can't be read.
export async function parseServerIni(iniPath) {
  let text;
  try {
    text = await fs.promises.readFile(iniPath, "utf-8");
  } catch {
    return null;
  }
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1);
  }
  const splitSemi = (v) =>
    (v || "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    raw: out,
    Mods: splitSemi(out.Mods),
    WorkshopItems: splitSemi(out.WorkshopItems),
    Map: splitSemi(out.Map),
    RCONPort: parseInt(out.RCONPort, 10) || null,
    RCONPassword: out.RCONPassword || "",
    DefaultPort: parseInt(out.DefaultPort, 10) || null,
    PublicName: out.PublicName || "",
  };
}

// Walk steamapps/workshop/content/108600/<id>/mods/<modName> and return
// Map<workshopId, { mods: string[], maps: string[] }>. Skips items that
// haven't finished downloading (no mod.info inside).
//
// PZ resolves Mods= against the `id=` value(s) declared in each mod.info,
// NOT the folder name. A single mod.info can declare MULTIPLE `id=` lines
// (sub-mods bundled in one folder). We collect every declared id and also
// include the folder name as a fallback for legacy / non-conforming mods.
//
// B42 introduced a multi-version layout where mod.info and media/maps/
// can live under versioned subfolders like `common/`, `41/`, `42/`
// (e.g. <mod>/42/mod.info and <mod>/common/media/maps/<name>/). We
// therefore probe the mod root AND each direct subdirectory.
async function readModIds(modInfoPath, fallbackName) {
  try {
    const text = await fs.promises.readFile(modInfoPath, "utf-8");
    const ids = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith(";")) continue;
      const m = line.match(/^id\s*=\s*(.+?)\s*$/i);
      if (m && m[1]) ids.push(m[1]);
    }
    if (ids.length === 0 && fallbackName) ids.push(fallbackName);
    else if (fallbackName && !ids.includes(fallbackName))
      ids.push(fallbackName);
    return ids;
  } catch {
    return fallbackName ? [fallbackName] : [];
  }
}

// Collect declared mod ids + map folder names from a single mod folder,
// handling both legacy (<mod>/mod.info, <mod>/media/maps/) and B42
// versioned layouts (<mod>/<version>/mod.info, <mod>/<version>/media/maps/).
async function collectModContent(modDir, fallbackName) {
  const ids = new Set();
  const maps = new Set();

  // Candidate roots: the mod dir itself plus every direct subdirectory.
  // B42 conventions use `common`, `41`, `42`, but mods sometimes use other
  // names too (e.g. `43`), so we don't whitelist — we just probe one level.
  const candidateRoots = [modDir];
  const children = await safeReaddir(modDir);
  if (children) {
    await Promise.all(
      children.map(async (child) => {
        const childPath = path.join(modDir, child);
        const st = await safeStat(childPath);
        if (st && st.isDirectory()) candidateRoots.push(childPath);
      }),
    );
  }

  await Promise.all(
    candidateRoots.map(async (root) => {
      const miPath = path.join(root, "mod.info");
      const mi = await safeStat(miPath);
      if (mi && mi.isFile()) {
        const declared = await readModIds(miPath, fallbackName);
        for (const id of declared) ids.add(id);
      }
      const mapDir = path.join(root, "media", "maps");
      const mapNames = await safeReaddir(mapDir);
      if (mapNames) for (const m of mapNames) maps.add(m);
    }),
  );

  return { ids: [...ids], maps: [...maps] };
}

export async function scanWorkshopMods(installPath) {
  const out = new Map();
  if (!installPath) return out;
  const root = path.join(
    installPath,
    "steamapps",
    "workshop",
    "content",
    "108600",
  );
  const ids = await safeReaddir(root);
  if (!ids) return out;
  await Promise.all(
    ids.map(async (id) => {
      if (!/^\d+$/.test(id)) return;
      const modsRoot = path.join(root, id, "mods");
      const modNames = await safeReaddir(modsRoot);
      if (!modNames) return;
      const entry = { mods: [], maps: [] };
      await Promise.all(
        modNames.map(async (name) => {
          const collected = await collectModContent(
            path.join(modsRoot, name),
            name,
          );
          for (const declaredId of collected.ids) entry.mods.push(declaredId);
          for (const m of collected.maps) entry.maps.push(m);
        }),
      );
      if (entry.mods.length || entry.maps.length) out.set(id, entry);
    }),
  );
  return out;
}

// Local (non-Workshop) mods live under <zPath>/mods/<name>/mod.info.
// Returns { mods: Set<string>, maps: Set<string> }. Same B42-aware layout
// probing as scanWorkshopMods.
export async function scanLocalMods(zPath) {
  const mods = new Set();
  const maps = new Set();
  if (!zPath) return { mods, maps };
  for (const dir of ["mods", "Mods"]) {
    const root = path.join(zPath, dir);
    const names = await safeReaddir(root);
    if (!names) continue;
    await Promise.all(
      names.map(async (name) => {
        const collected = await collectModContent(path.join(root, name), name);
        for (const declaredId of collected.ids) mods.add(declaredId);
        for (const m of collected.maps) maps.add(m);
      }),
    );
  }
  return { mods, maps };
}
