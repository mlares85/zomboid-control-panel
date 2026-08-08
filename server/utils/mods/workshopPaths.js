import path from "path";
import fs from "fs";
import os from "os";
import { createLogger } from "../logger.js";

const log = createLogger("API:Mods");

// Helper to get workshop paths for a mod
export function getWorkshopPaths(workshopId, serverPath) {
  const home = os.homedir();
  const paths = [
    // Server's steamapps folder
    path.join(
      serverPath,
      "steamapps",
      "workshop",
      "content",
      "108600",
      workshopId,
    ),
    // Alternative location
    path.join(
      serverPath,
      "..",
      "steamapps",
      "workshop",
      "content",
      "108600",
      workshopId,
    ),
    // User's Steam folder — platform-specific
    path.join(
      home,
      "Steam",
      "steamapps",
      "workshop",
      "content",
      "108600",
      workshopId,
    ),
  ];
  // Add Linux-specific Steam paths
  if (process.platform !== "win32") {
    paths.push(
      path.join(
        home,
        ".local",
        "share",
        "Steam",
        "steamapps",
        "workshop",
        "content",
        "108600",
        workshopId,
      ),
      path.join(
        home,
        ".steam",
        "steam",
        "steamapps",
        "workshop",
        "content",
        "108600",
        workshopId,
      ),
    );
  }
  return paths;
}

// Helper to check if a map folder contains actual map tile data (not just overlays/spawns)
// Valid map folders have .lotheader, objects.lua, or .lotpack/.bin cell data
export function isValidMapFolder(mapFolderPath) {
  try {
    const files = fs.readdirSync(mapFolderPath);
    for (const file of files) {
      const lower = file.toLowerCase();
      if (
        lower.endsWith(".lotheader") ||
        lower === "objects.lua" ||
        lower.endsWith(".lotpack")
      ) {
        return true;
      }
      // Cell data files like chunkdata_*_*_*.bin or world_*_*.lotpack
      if (lower.startsWith("world_") || lower.startsWith("chunkdata_")) {
        return true;
      }
    }
    return false;
  } catch (e) {
    log.debug(`Error validating map folder ${mapFolderPath}: ${e.message}`);
    return false;
  }
}

// Helper function to find map folders from a workshop mod
// Map mods have a media/maps folder with their map folder inside
// Only returns folders that contain actual map tile data
export function findMapFoldersFromWorkshop(workshopId, serverPath) {
  const mapFolders = [];
  const possiblePaths = getWorkshopPaths(workshopId, serverPath);

  // Helper: scan a media/maps directory for valid map subfolders
  function scanMapsDir(mapsPath) {
    if (!fs.existsSync(mapsPath)) return;
    const mapEntries = fs.readdirSync(mapsPath, { withFileTypes: true });
    for (const mapEntry of mapEntries) {
      if (
        mapEntry.isDirectory() &&
        !mapFolders.includes(mapEntry.name) &&
        isValidMapFolder(path.join(mapsPath, mapEntry.name))
      ) {
        mapFolders.push(mapEntry.name);
        log.debug(
          `Found valid map folder: ${mapEntry.name} in workshop ${workshopId}`,
        );
      }
    }
  }

  for (const workshopPath of possiblePaths) {
    if (!fs.existsSync(workshopPath)) continue;

    // Look for mods subfolder first (some mods have mods/ModName/media/maps structure)
    const modsFolder = path.join(workshopPath, "mods");
    const searchPath = fs.existsSync(modsFolder) ? modsFolder : workshopPath;

    try {
      if (fs.existsSync(searchPath)) {
        const entries = fs.readdirSync(searchPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const entryPath = path.join(searchPath, entry.name);

          // Check standard path: <entry>/media/maps/
          scanMapsDir(path.join(entryPath, "media", "maps"));

          // B42 multi-version layout: probe every direct subdirectory for
          // <entry>/<sub>/media/maps/ (covers common, 42, 42.0, 42.1, 41,
          // 43, and any future version folder).
          try {
            const subEntries = fs.readdirSync(entryPath, {
              withFileTypes: true,
            });
            for (const sub of subEntries) {
              if (sub.isDirectory()) {
                scanMapsDir(path.join(entryPath, sub.name, "media", "maps"));
              }
            }
          } catch {
            // Ignore unreadable mod folders
          }
        }
      }

      // Also check direct media/maps path (some mods don't have mods subfolder)
      scanMapsDir(path.join(workshopPath, "media", "maps"));

      if (mapFolders.length > 0) return mapFolders;
    } catch (e) {
      // Continue to next path
    }
  }

  return mapFolders;
}

// B42 introduced a multi-version layout where mod.info can live under
// versioned subdirectories of the mod folder (e.g. <mod>/common/mod.info,
// <mod>/42/mod.info, <mod>/42.0/mod.info, future <mod>/43/mod.info, ...).
// These two helpers rank candidate mod.info paths so the most specific /
// highest version wins when multiple exist.
export function parseModInfoVersionFolder(folderName) {
  if (!/^\d+(?:\.\d+)*$/.test(folderName)) return null;
  return folderName.split(".").map((part) => Number.parseInt(part, 10));
}

export function compareModInfoCandidatePaths(leftCandidate, rightCandidate) {
  const leftVersion = leftCandidate.version;
  const rightVersion = rightCandidate.version;

  if (leftVersion && !rightVersion) return -1;
  if (!leftVersion && rightVersion) return 1;

  if (leftVersion && rightVersion) {
    const maxParts = Math.max(leftVersion.length, rightVersion.length);
    for (let partIndex = 0; partIndex < maxParts; partIndex++) {
      const leftPart = leftVersion[partIndex] || 0;
      const rightPart = rightVersion[partIndex] || 0;
      if (leftPart !== rightPart) return rightPart - leftPart;
    }
  }

  return leftCandidate.order - rightCandidate.order;
}
