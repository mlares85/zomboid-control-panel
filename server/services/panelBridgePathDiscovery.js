/**
 * Bridge-path search logic for the auto-configure route and the scan-server
 * preview route (see panelBridgeScan.js for the separate scan-paths
 * recursive walker). The two functions here have their own priority
 * schemes (written independently against slightly different assumptions
 * about where -cachedir points), so they're kept separate rather than
 * forced into a single unified search — that would risk changing which
 * candidate path wins for existing installs.
 */

import fs from "fs";
import path from "path";
import os from "os";

function safeReadDir(dirPath) {
  try {
    return fs.existsSync(dirPath) ? fs.readdirSync(dirPath) : [];
  } catch (e) {
    return [];
  }
}

function describePath(p, source, priority) {
  const statusFile = path.join(p, "status.json");
  const initFile = path.join(p, ".init");
  const hasStatus = fs.existsSync(statusFile);
  const hasInit = fs.existsSync(initFile);
  return {
    path: p,
    source,
    hasStatus,
    hasInit,
    exists: hasStatus || hasInit || fs.existsSync(p),
    priority,
  };
}

function byStatusThenInitThenPriority(a, b) {
  if (a.hasStatus && !b.hasStatus) return -1;
  if (!a.hasStatus && b.hasStatus) return 1;
  if (a.hasInit && !b.hasInit) return -1;
  if (!a.hasInit && b.hasInit) return 1;
  return a.priority - b.priority;
}

// Used by POST /auto-configure. Applies write-side-effect-free path
// discovery only — configuring/starting the bridge stays in the route.
export function findAutoConfigurePath(targetServer, serverName) {
  const possiblePaths = [];
  const searchedLocations = [];

  const addPath = (p, source, priority = 10) => {
    if (possiblePaths.some((pp) => pp.path === p)) return;
    const entry = describePath(p, source, priority);
    possiblePaths.push(entry);
    searchedLocations.push({
      path: p,
      source,
      hasStatus: entry.hasStatus,
      hasInit: entry.hasInit,
    });
  };

  // PRIORITY 1: zomboidDataPath is where -cachedir points - this is where the mod WRITES status.json
  // This should be checked first since it's explicitly configured for the server
  if (targetServer.zomboidDataPath) {
    addPath(
      path.join(targetServer.zomboidDataPath, "Lua", "panelbridge", serverName),
      "zomboidDataPath/Lua (cachedir)",
      1,
    );
  }

  // PRIORITY 2 (fallback): default ~/Zomboid folder — works on both Windows and Linux when
  // the server runs without a custom -cachedir (e.g., most Linux dedicated server setups)
  addPath(
    path.join(os.homedir(), "Zomboid", "Lua", "panelbridge", serverName),
    "default Zomboid folder",
    2,
  );

  // PRIORITY 3: Look for Server_files* folders at the parent level (runtime data location)
  // This is where -cachedir typically points for dedicated servers with separate data folders
  if (targetServer.installPath) {
    const parentDir = path.dirname(targetServer.installPath);
    const parentContents = safeReadDir(parentDir);
    for (const item of parentContents) {
      // Match Server_files* patterns (e.g., Server_files_B42, Server_files_B42_Beta1)
      if (item.startsWith("Server_files") || item.match(/Server.*files/i)) {
        const luaPath = path.join(parentDir, item, "Lua", "panelbridge", serverName);
        addPath(luaPath, `${item}/Lua`, 3);
      }
    }

    // PRIORITY 4: Also check grandparent directory (for nested setups)
    const grandParentDir = path.dirname(parentDir);
    if (grandParentDir !== parentDir) {
      const grandParentContents = safeReadDir(grandParentDir);
      for (const item of grandParentContents) {
        if (item.startsWith("Server_files") || item.match(/Server.*files/i)) {
          const luaPath = path.join(
            grandParentDir,
            item,
            "Lua",
            "panelbridge",
            serverName,
          );
          addPath(luaPath, `${item}/Lua`, 4);
        }
      }
    }

    // PRIORITY 5: Lua folder directly in install path (fallback)
    addPath(
      path.join(targetServer.installPath, "Lua", "panelbridge", serverName),
      "installPath/Lua",
      5,
    );
  }

  possiblePaths.sort(byStatusThenInitThenPriority);

  // Find first path that has actual status.json (best match)
  let foundPath = possiblePaths.find((p) => p.hasStatus);
  // Fall back to path with .init file
  if (!foundPath) foundPath = possiblePaths.find((p) => p.hasInit);
  // Fall back to path that already exists
  if (!foundPath) foundPath = possiblePaths.find((p) => p.exists);
  // Fall back to first path by priority (expected location - don't create it)
  if (!foundPath && possiblePaths.length > 0) {
    possiblePaths.sort((a, b) => a.priority - b.priority);
    foundPath = possiblePaths[0];
  }

  return { foundPath: foundPath || null, possiblePaths, searchedLocations };
}

// Used by GET /scan-server/:serverId — a read-only preview with its own
// (slightly different) priority weighting, shown to the user before they
// commit to auto-configure.
export function scanServerPreviewPaths(targetServer, serverName) {
  const possiblePaths = [];
  const addPath = (p, source, priority = 10) => {
    if (possiblePaths.some((pp) => pp.path === p)) return;
    possiblePaths.push(describePath(p, source, priority));
  };

  // Check default Zomboid user folder (B42 without -cachedir)
  addPath(
    path.join(os.homedir(), "Zomboid", "Lua", "panelbridge", serverName),
    "default Zomboid folder",
    0,
  );

  if (targetServer.installPath) {
    const parentDir = path.dirname(targetServer.installPath);

    // Server_files folders at parent level
    const parentContents = safeReadDir(parentDir);
    for (const item of parentContents) {
      if (item.startsWith("Server_files") || item.match(/Server.*files/i)) {
        const luaPath = path.join(parentDir, item, "Lua", "panelbridge", serverName);
        addPath(luaPath, `${item}`, 1);
      }
    }

    // Grandparent
    const grandParentDir = path.dirname(parentDir);
    if (grandParentDir !== parentDir) {
      const grandParentContents = safeReadDir(grandParentDir);
      for (const item of grandParentContents) {
        if (item.startsWith("Server_files") || item.match(/Server.*files/i)) {
          const luaPath = path.join(
            grandParentDir,
            item,
            "Lua",
            "panelbridge",
            serverName,
          );
          addPath(luaPath, `${item} (grandparent)`, 2);
        }
      }
    }

    addPath(
      path.join(targetServer.installPath, "Lua", "panelbridge", serverName),
      "installPath/Lua",
      3,
    );
    addPath(
      path.join(parentDir, "Lua", "panelbridge", serverName),
      "parent/Lua",
      4,
    );
  }

  if (targetServer.zomboidDataPath) {
    addPath(
      path.join(targetServer.zomboidDataPath, "Lua", "panelbridge", serverName),
      "zomboidDataPath",
      1,
    );
  }

  possiblePaths.sort(byStatusThenInitThenPriority);

  const recommendedPath =
    possiblePaths.find((p) => p.hasStatus) ||
    possiblePaths.find((p) => p.hasInit) ||
    possiblePaths[0] ||
    null;

  return { possiblePaths, recommendedPath };
}
