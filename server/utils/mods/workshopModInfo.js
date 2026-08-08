import path from "path";
import fs from "fs";
import { createLogger } from "../logger.js";
import { readTextFile } from "./iniFile.js";
import {
  getWorkshopPaths,
  parseModInfoVersionFolder,
  compareModInfoCandidatePaths,
} from "./workshopPaths.js";

const log = createLogger("API:Mods");

// Helper to getting full details of mods inside a workshop item.
//
// B42 introduced a multi-version layout where mod.info can live under
// versioned subdirectories of the mod folder (e.g. <mod>/common/mod.info,
// <mod>/42/mod.info, <mod>/42.0/mod.info, future <mod>/43/mod.info, ...).
// We probe the mod root AND every direct subdirectory so we resolve mods
// regardless of which layout the author used, instead of relying on a
// fixed allowlist of folder names.
//
// A single mod.info can ALSO declare multiple `id=` lines (sub-mods that
// share assets). We collect every id rather than letting later lines
// overwrite earlier ones.
export function getModDetailsFromWorkshop(workshopId, serverPath) {
  const mods = [];
  const seenIds = new Set();
  const possiblePaths = getWorkshopPaths(workshopId, serverPath);

  // Parse a mod.info file and return { ids: [...], meta: { name, poster, ... } }.
  function parseModInfoFile(modInfoPath) {
    const ids = [];
    const meta = {};
    let content;
    try {
      content = readTextFile(modInfoPath);
    } catch {
      return { ids, meta };
    }
    if (!content) return { ids, meta };
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//") || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      const key = line.substring(0, idx).trim();
      const val = line.substring(idx + 1).trim();
      if (!key) continue;
      if (key.toLowerCase() === "id") {
        if (val) ids.push(val);
      } else if (!(key in meta)) {
        // First-occurrence wins for non-id fields (name/poster/icon/etc.)
        meta[key] = val;
      }
    }
    return { ids, meta };
  }

  for (const workshopPath of possiblePaths) {
    if (!fs.existsSync(workshopPath)) continue;

    const modsFolder = path.join(workshopPath, "mods");
    const searchPath = fs.existsSync(modsFolder) ? modsFolder : workshopPath;

    try {
      const entries = fs.readdirSync(searchPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const modDir = path.join(searchPath, entry.name);
        // Build candidate mod.info paths: the mod root, plus every direct
        // subdirectory (covers `common/`, `42/`, `42.0/`, `41/`, `43/`, ...).
        const candidatePaths = [
          {
            path: path.join(modDir, "mod.info"),
            version: null,
            order: 0,
          },
        ];
        try {
          const subfolders = fs
            .readdirSync(modDir, { withFileTypes: true })
            .filter((sub) => sub.isDirectory())
            .map((sub) => sub.name)
            .sort((leftName, rightName) =>
              leftName.localeCompare(rightName, undefined, {
                numeric: true,
                sensitivity: "base",
              }),
            );
          for (const [subIndex, subfolder] of subfolders.entries()) {
            candidatePaths.push({
              path: path.join(modDir, subfolder, "mod.info"),
              version: parseModInfoVersionFolder(subfolder),
              order: subIndex + 1,
            });
          }
        } catch (e) {
          log.debug(`Failed to scan subdirs for ${modDir}: ${e.message}`);
        }

        // Read every existing mod.info under this mod folder. Multiple
        // version-specific files may coexist; we union the declared ids.
        for (const candidate of candidatePaths
          .filter((item) => fs.existsSync(item.path))
          .sort(compareModInfoCandidatePaths)) {
          const { ids, meta } = parseModInfoFile(candidate.path);
          for (const id of ids) {
            if (seenIds.has(id)) continue;
            seenIds.add(id);
            mods.push({
              id,
              name: meta.name || id,
              poster: meta.poster,
              icon: meta.icon,
              description: meta.description || "",
              url: meta.url,
              require: meta.require
                ? meta.require
                    .split(/[,;]/)
                    .map((s) => s.trim().replace(/^\\+/, ""))
                    .filter(Boolean)
                : [],
            });
          }
        }
      }

      // If we found mods in this path, stop searching other paths
      if (mods.length > 0) return mods;
    } catch (e) {
      log.debug(`Error scanning path ${searchPath}: ${e.message}`);
    }
  }

  return mods;
}

// Helper function to find ALL mod IDs from workshop folder (returns array)
export function findAllModIdsFromWorkshop(workshopId, serverPath) {
  const mods = getModDetailsFromWorkshop(workshopId, serverPath);
  return mods.map((m) => m.id);
}

// Helper function to find mod ID from workshop folder
export function findModIdFromWorkshop(workshopId, serverPath) {
  // Use shared helper to parse details
  const mods = getModDetailsFromWorkshop(workshopId, serverPath);
  // Return the first ID found (legacy behavior)
  return mods.length > 0 ? mods[0].id : null;
}
