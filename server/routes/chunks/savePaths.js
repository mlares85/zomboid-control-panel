import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Chunks");
import { getSetting, getActiveServer } from "../../database/init.js";
import {
  normalizeUserPath,
  inspectZomboidPath,
} from "../../utils/zomboidPaths.js";

// Helper: Get zomboidDataPath from active server or legacy settings
export async function getZomboidDataPath() {
  // First try active server (multi-server support)
  const activeServer = await getActiveServer();
  if (activeServer?.zomboidDataPath) {
    return normalizeUserPath(activeServer.zomboidDataPath);
  }

  // Fallback to legacy settings
  const legacyPath = await getSetting("zomboidDataPath");
  return normalizeUserPath(legacyPath) || null;
}

export function resolveSavesPath(zomboidDataPath) {
  let savesPath = path.join(zomboidDataPath, "Saves", "Multiplayer");

  if (!fs.existsSync(savesPath)) {
    const basename = path.basename(zomboidDataPath);
    const parentDir = path.dirname(zomboidDataPath);
    const parentBase = path.basename(parentDir);
    const grandparentBase = path.basename(path.dirname(parentDir));
    if (basename === "Multiplayer" && parentBase === "Saves") {
      // User pointed at .../Saves/Multiplayer directly
      savesPath = zomboidDataPath;
    } else if (basename === "Saves") {
      // User pointed at .../Saves — append Multiplayer
      savesPath = path.join(zomboidDataPath, "Multiplayer");
    } else if (parentBase === "Multiplayer" && grandparentBase === "Saves") {
      // User pointed at an INDIVIDUAL save directory (.../Saves/Multiplayer/<savename>).
      // Walk up one level so we list saves from the right parent. Without this we
      // double-append and log: "Saves path not found: .../<savename>/Saves/Multiplayer".
      savesPath = parentDir;
    }
  }

  return savesPath;
}

export function resolveCustomOrDefaultDataPath(customPath) {
  if (!customPath) return null;
  const cleaned = normalizeUserPath(customPath);
  if (!cleaned) return null;
  const normalized = path.resolve(cleaned);
  if (!fs.existsSync(normalized)) {
    const error = new Error(
      `Custom path does not exist: ${normalized}. ` +
        `Check for typos and verify the panel has read access to this folder.`,
    );
    error.statusCode = 400;
    error.details = { reason: "not-found", tried: normalized };
    throw error;
  }
  try {
    if (!fs.statSync(normalized).isDirectory()) {
      const error = new Error(`Custom path is not a directory: ${normalized}`);
      error.statusCode = 400;
      error.details = { reason: "not-a-directory", tried: normalized };
      throw error;
    }
  } catch (e) {
    if (e.statusCode) throw e;
    const error = new Error(
      `Could not read custom path (${e.code || "error"}): ${normalized}`,
    );
    error.statusCode = 400;
    error.details = {
      reason: "stat-failed",
      tried: normalized,
      errorCode: e.code,
    };
    throw error;
  }

  const verdict = inspectZomboidPath(normalized);
  if (verdict.ok) return normalized;

  // Structured rejection — caller surfaces these in the debug payload so the
  // frontend can render targeted remediation (parent suggestion, "this is the
  // server install", etc.) instead of just a generic "doesn't look like…".
  if (verdict.reason === "install-folder") {
    log.warn(
      `[ChunkCleaner] Rejected custom path (server install folder): ${normalized}`,
    );
    const error = new Error(
      "This folder looks like a Project Zomboid server install (it contains " +
        "ProjectZomboid64.exe / .json or similar). " +
        "Point at the user data folder instead — usually " +
        (process.platform === "win32"
          ? "C:\\Users\\<you>\\Zomboid"
          : "~/Zomboid") +
        " — not the server folder.",
    );
    error.statusCode = 400;
    error.details = {
      reason: "install-folder",
      tried: normalized,
      checks: verdict.checks,
    };
    throw error;
  }

  // No Zomboid markers anywhere. If they pointed at .../Saves or
  // .../Multiplayer (common copy-paste mistake), suggest the parent.
  log.warn(
    `[ChunkCleaner] Rejected custom path (no Zomboid markers found): ${normalized}`,
  );
  let msg =
    "Path does not appear to be a Zomboid data directory. " +
    "Point at your Zomboid data folder (the one containing Saves/), " +
    "a Saves/Multiplayer folder, or an individual save directory.";
  if (verdict.parentSuggestion) {
    msg += ` Did you mean ${verdict.parentSuggestion}?`;
  }
  const error = new Error(msg);
  error.statusCode = 403;
  error.details = {
    reason: "no-zomboid-markers",
    tried: normalized,
    checks: verdict.checks,
    parentSuggestion: verdict.parentSuggestion || null,
  };
  throw error;
}
