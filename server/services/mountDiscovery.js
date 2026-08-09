// Detect PZ server files at common Docker mount points and env-configured
// paths. The most common panel deployment is Docker with the PZ install and
// save data bind-mounted in — this lets the panel offer a pre-populated
// server profile instead of making the user type paths in blind.
//
// All checks are synchronous (fs.existsSync/statSync). This runs once at
// startup and on-demand from a settings button, never in a hot path, so a
// handful of sync stat calls is cheap even on a slow bind mount.
import fs from "fs";
import path from "path";
import {
  getCandidateZomboidPaths,
  inspectZomboidPath,
} from "../utils/zomboidPaths.js";

const INI_SUFFIX_BLOCKLIST = [
  "_SandboxVars.ini",
  "_spawnpoints.ini",
  "_spawnregions.ini",
];

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function safeIsDir(dirPath) {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

// Server .ini files under a `Server/` folder, minus the sidecar files PZ
// writes alongside the real config (SandboxVars, spawn tables).
function readServerNames(serverDir) {
  if (!safeIsDir(serverDir)) return [];
  return safeReaddir(serverDir)
    .filter(
      (f) =>
        f.endsWith(".ini") &&
        !INI_SUFFIX_BLOCKLIST.some((suffix) => f.endsWith(suffix)),
    )
    .map((f) => f.replace(/\.ini$/, ""));
}

// Does `installPath` look like a PZ dedicated server install?
export function probeInstallPath(installPath) {
  if (!installPath || !safeIsDir(installPath)) {
    return {
      valid: false,
      serverNames: [],
      hasStartScript: false,
      hasPanelBridge: false,
    };
  }

  const entries = safeReaddir(installPath);
  const hasZomboidBinary = entries.some((f) => f.startsWith("ProjectZomboid64"));
  const hasStartScript = fs.existsSync(path.join(installPath, "start-server.sh"));
  const hasMediaLua = safeIsDir(path.join(installPath, "media", "lua"));
  const hasSteamapps = safeIsDir(path.join(installPath, "steamapps"));

  return {
    valid: hasZomboidBinary || hasStartScript || hasMediaLua || hasSteamapps,
    serverNames: readServerNames(path.join(installPath, "Server")),
    hasStartScript,
    hasPanelBridge: fs.existsSync(
      path.join(installPath, "media", "lua", "server", "PanelBridge.lua"),
    ),
  };
}

// Does `dataPath` look like a PZ user/save data folder (the `-cachedir`
// target, conventionally named `Zomboid`)?
export function probeDataPath(dataPath) {
  if (!dataPath || !safeIsDir(dataPath)) {
    return { valid: false, path: dataPath || null, serverNames: [] };
  }

  const serverNames = readServerNames(path.join(dataPath, "Server"));
  const hasSaves = safeIsDir(path.join(dataPath, "Saves"));
  const hasLua = safeIsDir(path.join(dataPath, "Lua"));

  return {
    valid: hasSaves || hasLua || serverNames.length > 0,
    path: dataPath,
    serverNames,
  };
}

// A `Zomboid` folder living directly under the install path — the layout
// used by images that bind-mount only one path instead of setting
// PZ_SAVE_PATH separately.
export function findDataPath(installPath) {
  if (!installPath) return null;
  const candidate = path.join(installPath, "Zomboid");
  return safeIsDir(candidate) ? candidate : null;
}

const COMMON_MOUNT_CANDIDATES = [
  { install: "/pz-server", data: "/zomboid", source: "common-mount" },
  {
    install: "/serverdata/serverfiles",
    data: "/serverdata/serverfiles/Zomboid",
    source: "ich777-mount",
  },
  { install: "/steam/pz", data: "/steam/pz/Zomboid", source: "steam-mount" },
];

function envCandidates() {
  return [
    {
      install: process.env.PZ_SERVER_PATH,
      data: process.env.PZ_SAVE_PATH,
      source: "environment",
    },
  ];
}

// Probe env-configured and common Docker bind-mount locations for PZ server
// files, returning one entry per valid install found. Used by the
// discover-mounts / create-from-discovery settings flow (routes/discovery.js).
export function discoverMounts() {
  const candidates = [];
  const seen = new Set();

  for (const candidate of [...envCandidates(), ...COMMON_MOUNT_CANDIDATES]) {
    if (!candidate.install || seen.has(candidate.install)) continue;
    seen.add(candidate.install);

    const installResult = probeInstallPath(candidate.install);
    if (!installResult.valid) continue;

    const dataPath = candidate.data || findDataPath(candidate.install);
    const dataResult = probeDataPath(dataPath);

    candidates.push({
      installPath: candidate.install,
      dataPath: dataResult.valid ? dataResult.path : dataPath || null,
      source: candidate.source,
      serverNames: dataResult.serverNames.length
        ? dataResult.serverNames
        : installResult.serverNames,
      hasStartScript: installResult.hasStartScript,
      hasPanelBridge: installResult.hasPanelBridge,
    });
  }

  return candidates;
}

function parseIni(content) {
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex > 0) {
      result[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim();
    }
  }
  return result;
}

// Read RCON/port/name settings out of a discovered server's
// `Server/<name>.ini` so create-from-discovery can pre-fill a profile
// instead of leaving RCON blank.
export function readServerIniSettings(dataPath, serverName) {
  const iniPath = path.join(dataPath, "Server", `${serverName}.ini`);
  if (!fs.existsSync(iniPath)) return null;

  let settings;
  try {
    settings = parseIni(fs.readFileSync(iniPath, "utf-8"));
  } catch {
    return null;
  }

  return {
    rconPort: parseInt(settings.RCONPort, 10) || 27015,
    rconPassword: settings.RCONPassword || "",
    serverPort: parseInt(settings.DefaultPort, 10) || 16261,
    publicName: settings.PublicName || serverName,
  };
}

// ---------------------------------------------------------------------------
// Lighter-weight single-directory probe used by the first-run onboarding
// wizard's environment snapshot (routes/environment.js). Reuses the
// signature checks zomboidPaths.js already has for the manual "detect from
// this path" flow; this just widens the candidate list to common container
// bind-mount points (ich777/steamcmd, linuxserver, Unraid appdata layouts)
// that a host-account-based search would never find.
// ---------------------------------------------------------------------------

const CONTAINER_MOUNT_CANDIDATES = [
  "/pz-server",
  "/server",
  "/serverfiles",
  "/data",
  "/config",
  "/home/steam/pz-dedicated/Zomboid",
];

function envPathCandidates() {
  return [process.env.PZ_SERVER_PATH, process.env.PZ_SAVE_PATH].filter(
    Boolean,
  );
}

// Does `dir` look like a PZ data folder or a PZ install folder? Returns
// null when it's neither (missing, unreadable, or no recognizable markers).
export function probeMount(dir) {
  if (!dir) return null;
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  } catch {
    return null;
  }
  const verdict = inspectZomboidPath(dir);
  if (verdict.ok) {
    return {
      path: dir,
      type: "data",
      hasSavesDir: Boolean(
        verdict.checks.hasSavesDir || verdict.checks.hasMultiplayerDir,
      ),
    };
  }
  if (verdict.reason === "install-folder") {
    return { path: dir, type: "install" };
  }
  return null;
}

// Scan env-configured paths, common container bind-mount points, and the
// OS-account candidates zomboidPaths.js already knows about. All checks are
// existsSync-cheap, so this is safe to call on every environment snapshot
// request during onboarding.
export function discoverEnvironmentMounts() {
  const candidates = [
    ...envPathCandidates(),
    ...CONTAINER_MOUNT_CANDIDATES,
    ...getCandidateZomboidPaths().map((c) => c.path),
  ];

  const seen = new Set();
  const results = [];
  for (const dir of candidates) {
    const resolved = path.resolve(dir);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    const found = probeMount(resolved);
    if (found) results.push(found);
  }
  return results;
}
