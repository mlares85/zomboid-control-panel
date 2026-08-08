/**
 * Recursive filesystem scan for GET /scan-paths — walks known Zomboid data
 * directories looking for any panelbridge folder, not just the active
 * server's expected one. Split out from panelBridgePathDiscovery.js purely
 * to stay under the file line-count limit; conceptually part of the same
 * bridge-path-discovery feature.
 */

import fs from "fs";
import path from "path";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Services:PanelBridgeScan");

export function scanKnownBridgeLocations({ activeServer, currentBridgePath }) {
  const foundBridges = [];
  const scannedDirs = [];

  const describeFoundBridge = (bridgeDir, name, baseDir) => {
    const serverPath = path.join(bridgeDir, name);
    const statusFile = path.join(serverPath, "status.json");
    const initFile = path.join(serverPath, ".init");
    const hasStatus = fs.existsSync(statusFile);
    const hasInit = fs.existsSync(initFile);
    let statusAge = null;
    let modVersion = null;
    if (hasStatus) {
      try {
        const stats = fs.statSync(statusFile);
        statusAge = Date.now() - stats.mtimeMs;
        const content = JSON.parse(fs.readFileSync(statusFile, "utf-8"));
        modVersion = content.version;
      } catch (e) {
        log.debug(`Failed to parse status for ${name}: ${e.message}`);
      }
    }
    return {
      path: serverPath,
      serverName: name,
      baseDir,
      hasStatus,
      hasInit,
      statusAge,
      modVersion,
      isActive: statusAge !== null && statusAge < 60000, // Active if updated in last minute
    };
  };

  const collectServerFolders = (bridgeDir, baseDir) => {
    try {
      const serverFolders = fs.readdirSync(bridgeDir, { withFileTypes: true });
      for (const sf of serverFolders) {
        if (!sf.isDirectory()) continue;
        foundBridges.push(describeFoundBridge(bridgeDir, sf.name, baseDir));
      }
    } catch (e) {
      log.debug(`Failed to scan panelbridge folder in ${bridgeDir}: ${e.message}`);
    }
  };

  const searchForBridge = (baseDir, depth = 0, maxDepth = 3) => {
    if (depth > maxDepth || !baseDir || !fs.existsSync(baseDir)) return;
    try {
      const contents = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const item of contents) {
        if (!item.isDirectory()) continue;
        const itemPath = path.join(baseDir, item.name);

        if (item.name === "panelbridge") {
          collectServerFolders(itemPath, baseDir);
          continue;
        }

        if (item.name === "Lua") {
          const bridgePath = path.join(itemPath, "panelbridge");
          if (fs.existsSync(bridgePath)) {
            scannedDirs.push(bridgePath);
            searchForBridge(bridgePath, depth + 1, maxDepth);
          }
          continue;
        }

        if (item.name.startsWith("Server_files") || item.name.match(/Server.*files/i)) {
          scannedDirs.push(itemPath);
          searchForBridge(itemPath, depth + 1, maxDepth);
        }
      }
    } catch (e) {
      // Ignore errors reading directories
    }
  };

  const searchDirs = new Set();
  if (activeServer?.installPath) {
    searchDirs.add(activeServer.installPath);
    searchDirs.add(path.dirname(activeServer.installPath));
  }
  if (activeServer?.zomboidDataPath) {
    searchDirs.add(activeServer.zomboidDataPath);
    searchDirs.add(path.dirname(activeServer.zomboidDataPath));
  }
  if (currentBridgePath) {
    const parts = currentBridgePath.split(path.sep);
    const panelbridgeIdx = parts.indexOf("panelbridge");
    if (panelbridgeIdx > 0) {
      searchDirs.add(parts.slice(0, panelbridgeIdx).join(path.sep));
    }
  }

  for (const dir of searchDirs) {
    if (dir) {
      scannedDirs.push(dir);
      searchForBridge(dir);
    }
  }

  return { foundBridges, scannedDirs: [...new Set(scannedDirs)] };
}
