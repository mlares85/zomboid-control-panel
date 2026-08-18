/**
 * Recursive filesystem scan for GET /scan-paths — walks known Zomboid data
 * directories looking for any panelbridge folder, not just the active
 * server's expected one. Split out from panelBridgePathDiscovery.js purely
 * to stay under the file line-count limit; conceptually part of the same
 * bridge-path-discovery feature.
 */

import path from "path";
import { createLogger } from "../utils/logger.js";
import { LocalFiles } from "./fileAccess/index.js";

const log = createLogger("Services:PanelBridgeScan");

export async function scanKnownBridgeLocations({ activeServer, currentBridgePath, fileAccess } = {}) {
  const fa = fileAccess || new LocalFiles();
  const foundBridges = [];
  const scannedDirs = [];

  const describeFoundBridge = async (bridgeDir, name, baseDir) => {
    const serverPath = path.join(bridgeDir, name);
    const statusFile = path.join(serverPath, "status.json");
    const initFile = path.join(serverPath, ".init");
    const hasStatus = await fa.exists(statusFile);
    const hasInit = await fa.exists(initFile);
    let statusAge = null;
    let modVersion = null;
    if (hasStatus) {
      try {
        const stats = await fa.stat(statusFile);
        statusAge = Date.now() - stats.mtimeMs;
        const read = await fa.readFile(statusFile);
        const content = JSON.parse(read.success ? read.data : "");
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

  const collectServerFolders = async (bridgeDir, baseDir) => {
    try {
      const serverFolders = await fa.readdir(bridgeDir, { withFileTypes: true });
      for (const sf of serverFolders) {
        if (!sf.isDirectory) continue;
        foundBridges.push(await describeFoundBridge(bridgeDir, sf.name, baseDir));
      }
    } catch (e) {
      log.debug(`Failed to scan panelbridge folder in ${bridgeDir}: ${e.message}`);
    }
  };

  const searchForBridge = async (baseDir, depth = 0, maxDepth = 3) => {
    if (depth > maxDepth || !baseDir || !await fa.exists(baseDir)) return;
    try {
      const contents = await fa.readdir(baseDir, { withFileTypes: true });
      for (const item of contents) {
        if (!item.isDirectory) continue;
        const itemPath = path.join(baseDir, item.name);

        if (item.name === "panelbridge") {
          await collectServerFolders(itemPath, baseDir);
          continue;
        }

        if (item.name === "Lua") {
          const bridgePath = path.join(itemPath, "panelbridge");
          if (await fa.exists(bridgePath)) {
            scannedDirs.push(bridgePath);
            await searchForBridge(bridgePath, depth + 1, maxDepth);
          }
          continue;
        }

        if (item.name.startsWith("Server_files") || item.name.match(/Server.*files/i)) {
          scannedDirs.push(itemPath);
          await searchForBridge(itemPath, depth + 1, maxDepth);
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
      await searchForBridge(dir);
    }
  }

  return { foundBridges, scannedDirs: [...new Set(scannedDirs)] };
}
