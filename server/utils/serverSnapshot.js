import fs from "fs";
import path from "path";
import { parseIni } from "../routes/serverFiles/ini.js";
import { parseSandboxVars } from "../routes/serverFiles/sandboxParse.js";
import { getTrackedMods } from "../database/init.js";
import { getModDetailsFromWorkshop } from "./mods/workshopModInfo.js";
import { createLogger } from "./logger.js";

const log = createLogger("Backup:Snapshot");

// Curated, non-secret INI keys worth recording in a backup snapshot. There is
// no "PZ defaults" table anywhere in this codebase to diff a true
// non-default set against, so — like the debug support bundle
// (server/routes/debug/support-bundle/serverInfo.js) — this captures a fixed
// allowlist of the settings that matter for understanding what a save was
// configured like, rather than the entire INI.
const SNAPSHOT_INI_KEYS = [
  "MaxPlayers",
  "PVP",
  "Map",
  "Public",
  "PublicName",
  "Open",
  "PauseEmpty",
  "Faction",
  "FactionPlayers",
  "PlayerSafehouse",
  "SafehouseAllowTrepass",
  "GlobalChat",
  "SleepAllowed",
  "SleepNeeded",
  "DisplayUserName",
];

// Defense in depth: never snapshot a key that looks like a credential, even
// if it were ever added to SNAPSHOT_INI_KEYS by mistake.
const SECRET_KEY_PATTERN = /password|secret|token/i;

// The full remote-mirror-aware path resolution
// (routes/serverFiles/context.js#getServerConfigPath) isn't needed here:
// backups are unavailable for remote servers, so this only ever needs the
// two locally-configured path shapes.
function resolveConfigPath(activeServer) {
  if (activeServer?.serverConfigPath) return activeServer.serverConfigPath;
  if (activeServer?.zomboidDataPath) {
    return path.join(activeServer.zomboidDataPath, "Server");
  }
  return null;
}

function readServerIniSnapshot(configPath, serverName) {
  if (!configPath) return {};
  const iniPath = path.join(configPath, `${serverName}.ini`);
  if (!fs.existsSync(iniPath)) return {};
  try {
    const parsed = parseIni(fs.readFileSync(iniPath, "utf-8"));
    const snapshot = {};
    for (const key of SNAPSHOT_INI_KEYS) {
      if (key in parsed && !SECRET_KEY_PATTERN.test(key)) {
        snapshot[key] = parsed[key];
      }
    }
    return snapshot;
  } catch (error) {
    log.warn(`Failed to read server INI for snapshot: ${error.message}`);
    return {};
  }
}

function readSandboxSnapshot(configPath, serverName) {
  if (!configPath) return {};
  const sandboxPath = path.join(configPath, `${serverName}_SandboxVars.lua`);
  if (!fs.existsSync(sandboxPath)) return {};
  try {
    const parsed = parseSandboxVars(fs.readFileSync(sandboxPath, "utf-8"));
    return { ...parsed.settings };
  } catch (error) {
    log.warn(`Failed to read SandboxVars for snapshot: ${error.message}`);
    return {};
  }
}

// Best-effort: the Steam Workshop mod ID (as declared in mod.info) is only
// resolvable when the workshop folder is present on this machine's install
// path. Missing it is normal (remote servers, not-yet-downloaded mods) so
// this never throws — it just leaves modId null.
function resolveModId(workshopId, installPath) {
  if (!installPath) return null;
  try {
    return getModDetailsFromWorkshop(workshopId, installPath)[0]?.id || null;
  } catch (error) {
    log.debug(`Could not resolve modId for workshop ${workshopId}: ${error.message}`);
    return null;
  }
}

async function buildModsSnapshot(installPath) {
  const tracked = await getTrackedMods();
  return tracked.map((mod) => ({
    workshopId: mod.workshop_id,
    modId: resolveModId(mod.workshop_id, installPath),
    name: mod.name || null,
  }));
}

/**
 * Captures a point-in-time snapshot of the active server's configuration for
 * embedding in a backup record, so a historical backup can show what the
 * server looked like when it was taken. Never includes RCON/admin passwords.
 */
export async function captureServerSnapshot({
  activeServer,
  playerCount = null,
  worldAge = null,
  saveSize = null,
}) {
  const serverName = activeServer?.serverName || "server";
  const configPath = resolveConfigPath(activeServer);
  return {
    serverName,
    serverId: activeServer?.id ?? null,
    provider: activeServer?.provider ?? null,
    installPath: activeServer?.installPath || null,
    zomboidDataPath: activeServer?.zomboidDataPath || null,
    template: activeServer?.lastAppliedTemplateId ?? null,
    sandboxVars: readSandboxSnapshot(configPath, serverName),
    serverIni: readServerIniSnapshot(configPath, serverName),
    mods: await buildModsSnapshot(activeServer?.installPath),
    playerCount,
    worldAge,
    saveSize,
  };
}
