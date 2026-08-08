/**
 * Copying PanelBridge.lua onto a game server: locate the bundled mod,
 * auto-install to the active/specified server, or install to a manually
 * supplied media/lua/server/ path.
 */

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getActiveServer, getServer } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { createLogger } from "../../utils/logger.js";
import { writeLuaAtomic } from "../../utils/embeddedLua.js";
import {
  resolveModLuaSource,
  modCandidateDirs,
  modCandidateDirsDirnameFirst,
} from "../../services/panelBridgeModSource.js";

const log = createLogger("API:PanelBridge");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// Get mod installation path (for copying mod to server)
router.get("/mod-path", async (req, res) => {
  const possiblePaths = modCandidateDirs(__dirname);
  let modPath = possiblePaths[0];
  let exists = false;

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      modPath = p;
      exists = true;
      break;
    }
  }

  // Also detect suggested install path from active server
  let suggestedInstallPath = null;
  try {
    const activeServer = await getActiveServer();
    if (activeServer?.installPath) {
      // For dedicated servers, Lua folder is at: {installPath}/media/lua/server/
      suggestedInstallPath = path.join(
        activeServer.installPath,
        "media",
        "lua",
        "server",
      );
    }
  } catch (e) {
    // Ignore
  }

  res.json({
    modPath,
    exists,
    files: exists ? fs.readdirSync(modPath) : [],
    suggestedInstallPath,
  });
});

// Auto-install mod to server's Lua folder (optionally specify serverId)
router.post("/install-mod-auto", async (req, res) => {
  try {
    const { serverId } = req.body;

    // Get specified server or active server
    let targetServer;
    if (serverId) {
      targetServer = await getServer(serverId);
      if (!targetServer) {
        return res
          .status(400)
          .json({ error: `Server with ID ${serverId} not found.` });
      }
    } else {
      targetServer = await getActiveServer();
      if (!targetServer) {
        return res.status(400).json({
          error: "No active server configured.",
          detail: "No server is configured yet. Go to Servers to add one.",
          fixUrl: "/servers",
        });
      }
    }

    // Use serverPath if available, otherwise extract directory from installPath
    let serverInstallDir = targetServer.serverPath || targetServer.installPath;
    if (!serverInstallDir) {
      return res.status(400).json({
        error: "Server install path not configured.",
        detail:
          "Set the install path in Servers > Edit, or PZ_SERVER_PATH in your compose file.",
        fixUrl: "/servers",
      });
    }

    // If installPath points to a file (e.g., .bat), extract the directory
    if (
      serverInstallDir.endsWith(".bat") ||
      serverInstallDir.endsWith(".sh") ||
      serverInstallDir.endsWith(".exe")
    ) {
      serverInstallDir = path.dirname(serverInstallDir);
    }

    // Install to: {serverInstallDir}/media/lua/server/PanelBridge.lua
    const luaServerPath = path.join(serverInstallDir, "media", "lua", "server");
    const destLuaFile = path.join(luaServerPath, "PanelBridge.lua");

    const { content: srcContent, source: sourceLocation } = resolveModLuaSource(
      modCandidateDirsDirnameFirst(__dirname),
    );

    if (!srcContent) {
      return res.status(404).json({
        error: "Source mod not found (no embedded Lua and no on-disk pz-mod).",
      });
    }

    writeLuaAtomic(destLuaFile, srcContent);

    res.json({
      success: true,
      message: "PanelBridge.lua installed to server Lua folder",
      path: destLuaFile,
      source: sourceLocation,
      serverName: targetServer.serverName || targetServer.name,
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Copy mod to server Lua folder (manual path)
router.post("/install-mod", (req, res) => {
  const { serverLuaPath } = req.body;

  // Support legacy field name
  const targetPath = serverLuaPath || req.body.serverModsPath;

  if (!targetPath) {
    return res
      .status(400)
      .json({ error: "serverLuaPath is required (path to media/lua/server/)" });
  }

  // Validate path: must be a string, absolute, no traversal
  if (typeof targetPath !== "string" || targetPath.length > 500) {
    return res.status(400).json({ error: "Invalid path format" });
  }

  const resolvedTarget = path.resolve(targetPath);

  // Must be absolute
  if (!path.isAbsolute(resolvedTarget)) {
    return res.status(400).json({ error: "Must be an absolute path" });
  }

  // Resolve symlinks to prevent traversal via symlink chains
  let realTarget;
  try {
    // If target doesn't exist yet, resolve the parent and join
    if (fs.existsSync(resolvedTarget)) {
      realTarget = fs.realpathSync(resolvedTarget);
    } else {
      const parent = path.dirname(resolvedTarget);
      if (fs.existsSync(parent)) {
        realTarget = path.join(
          fs.realpathSync(parent),
          path.basename(resolvedTarget),
        );
      } else {
        realTarget = resolvedTarget;
      }
    }
  } catch (e) {
    log.debug(`Path resolution failed for deploy target: ${e.message}`);
    realTarget = resolvedTarget;
  }

  // Path must end with expected PZ Lua server directory pattern
  // Use forward slashes for comparison but preserve original case on Linux (case-sensitive FS)
  const normalizedTarget = realTarget.replace(/\\/g, "/");
  const targetLower = normalizedTarget.toLowerCase();
  if (
    !targetLower.endsWith("/media/lua/server") &&
    !targetLower.endsWith("/media/lua/server/")
  ) {
    return res
      .status(400)
      .json({ error: "Path must point to a media/lua/server/ directory" });
  }

  try {
    const { content: srcContent } = resolveModLuaSource(
      modCandidateDirs(__dirname),
    );

    if (!srcContent) {
      return res.status(404).json({
        error: "Source mod not found (no embedded Lua and no on-disk pz-mod).",
      });
    }

    // Ensure target directory exists (use realTarget for safety)
    if (!fs.existsSync(realTarget)) {
      fs.mkdirSync(realTarget, { recursive: true, mode: 0o755 });
    }

    // Atomic write of the Lua file
    const destPath = path.join(realTarget, "PanelBridge.lua");
    writeLuaAtomic(destPath, srcContent);

    res.json({
      success: true,
      message: "PanelBridge.lua installed successfully",
      path: destPath,
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
