/**
 * Resolves the PanelBridge.lua source to deploy to a game server. Prefers
 * the Lua embedded in the running binary (guaranteed to match its version)
 * and falls back to the on-disk pz-mod/ folder for dev/source checkouts.
 * Shared by auto-configure, install-mod-auto, and install-mod, which each
 * previously duplicated this exact lookup.
 */

import fs from "fs";
import path from "path";
import {
  getEmbeddedPanelBridgeLua,
  compareModVersions,
  writeLuaAtomic,
} from "../utils/embeddedLua.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Services:PanelBridgeModSource");

export function resolveModLuaSource(candidateDirs) {
  const embedded = getEmbeddedPanelBridgeLua();
  if (embedded) return { content: embedded, source: "embedded" };

  for (const dir of candidateDirs) {
    const candidate = path.join(dir, "media", "lua", "server", "PanelBridge.lua");
    if (fs.existsSync(candidate)) {
      return { content: fs.readFileSync(candidate, "utf8"), source: candidate };
    }
  }
  return { content: null, source: null };
}

// cwd-first order, used by auto-configure / install-mod / mod-path
export function modCandidateDirs(dirname) {
  return [
    path.join(process.cwd(), "pz-mod", "PanelBridge"),
    path.join(path.dirname(process.execPath), "pz-mod", "PanelBridge"),
    path.join(dirname, "..", "..", "..", "pz-mod", "PanelBridge"),
  ];
}

// __dirname-first order, used by install-mod-auto (preserves its original
// lookup order from the pre-decomposition monolithic route file)
export function modCandidateDirsDirnameFirst(dirname) {
  return [
    path.join(dirname, "..", "..", "..", "pz-mod", "PanelBridge"),
    path.join(process.cwd(), "pz-mod", "PanelBridge"),
    path.join(path.dirname(process.execPath), "pz-mod", "PanelBridge"),
  ];
}

// Auto-install or version-upgrade PanelBridge.lua into a target server's
// media/lua/server/ folder. Used by POST /auto-configure right after the
// bridge path is (re)configured.
export async function installOrUpdateMod(targetServer, candidateDirs) {
  let modInstalled = false;
  let modUpdated = false;
  try {
    const serverInstallDir = targetServer.serverPath || targetServer.installPath;
    if (!serverInstallDir) return { modInstalled, modUpdated };

    const installDir =
      serverInstallDir.endsWith(".bat") ||
      serverInstallDir.endsWith(".sh") ||
      serverInstallDir.endsWith(".exe")
        ? path.dirname(serverInstallDir)
        : serverInstallDir;
    const destLuaFile = path.join(installDir, "media", "lua", "server", "PanelBridge.lua");

    const { content: srcContent } = resolveModLuaSource(candidateDirs);
    if (!srcContent) return { modInstalled, modUpdated };

    let needsCopy = !fs.existsSync(destLuaFile);

    // If dest exists, compare VERSION strings and only upgrade if
    // embedded is strictly newer (avoids silent downgrade of hand-
    // installed dev builds).
    if (!needsCopy) {
      modInstalled = true;
      try {
        const destContent = fs.readFileSync(destLuaFile, "utf8");
        const srcVersion = (srcContent.match(/VERSION\s*=\s*"([^"]+)"/) || [])[1];
        const destVersion = (destContent.match(/VERSION\s*=\s*"([^"]+)"/) || [])[1];
        if (srcVersion && destVersion && compareModVersions(srcVersion, destVersion) > 0) {
          needsCopy = true;
          modUpdated = true;
          log.info(`PanelBridge mod update: ${destVersion} → ${srcVersion}`);
        }
      } catch (_) {
        /* ignore read errors — keep existing */
      }
    }

    if (needsCopy) {
      writeLuaAtomic(destLuaFile, srcContent);
      modInstalled = true;
      log.info(
        modUpdated
          ? "PanelBridge mod updated on server"
          : "PanelBridge mod auto-installed to server",
      );
    }
  } catch (modError) {
    log.warn(`Auto-install mod failed: ${modError.message}`);
  }
  return { modInstalled, modUpdated };
}
