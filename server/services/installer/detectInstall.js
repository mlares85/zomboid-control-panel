/**
 * PZ install auto-detection for the setup wizard.
 *
 * Checks common installation paths for both SteamCMD and existing PZ server
 * installs. Used by the Server Setup page's "Fresh Install" mode to
 * pre-fill paths and skip unnecessary steps.
 *
 * Platform-specific default paths:
 *   Windows: C:\steamcmd, C:\pz-server, C:\Program Files (x86)\Steam\...
 *   Linux:   /opt/steamcmd, /home/steam/steamcmd, /opt/pz-server, ...
 *   Docker:  /pz-server, /serverdata/serverfiles, ...
 */
import fs from "fs";
import os from "os";
import path from "path";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("DetectInstall");

const isWindows = process.platform === "win32";

const WINDOWS_STEAMCMD_PATHS = [
  path.join(os.homedir(), "Documents", "SteamCMD"),
  "C:\\steamcmd",
  "C:\\SteamCMD",
  path.join(process.env.USERPROFILE || "C:\\Users\\Default", "steamcmd"),
  "C:\\Program Files\\SteamCMD",
];

const LINUX_STEAMCMD_PATHS = [
  "/opt/steamcmd",
  "/home/steam/steamcmd",
  "/home/steam/Steam/steamcmd",
  "/usr/games",
  "/usr/local/steamcmd",
];

const WINDOWS_PZ_PATHS = [
  "C:\\pz-server",
  "C:\\zomboid-server",
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Project Zomboid Dedicated Server",
  path.join(process.env.USERPROFILE || "C:\\Users\\Default", "pz-server"),
  // Steam library folders on other drives are discovered dynamically
  // by discoverSteamLibraryPaths() below
];

const LINUX_PZ_PATHS = [
  "/opt/pz-server",
  "/home/steam/pz-server",
  "/home/steam/pz-dedicated",
  "/srv/pz-server",
  "/pz-server",
  "/serverdata/serverfiles",
];

const PZ_SERVER_SIGNATURES = [
  "StartServer64.bat",       // Build 42 Windows
  "ProjectZomboid64.exe",    // Build 41 Windows
  "ProjectZomboid64",        // Build 41 Linux
  "start-server.sh",         // Build 41 Linux
  "start-server.bat",        // Build 41 Windows
  "projectzomboid.jar",      // Build 42 (both platforms)
];

/**
 * Detect SteamCMD at common system paths.
 * @returns {{ found: boolean, path?: string, exe?: string }}
 */
export function detectSteamCmd() {
  const candidates = [
    process.env.STEAMCMD_PATH,
    ...(isWindows ? WINDOWS_STEAMCMD_PATHS : LINUX_STEAMCMD_PATHS),
  ].filter(Boolean);

  for (const dir of candidates) {
    const exe = isWindows
      ? path.join(dir, "steamcmd.exe")
      : path.join(dir, "steamcmd.sh");
    if (safeExists(exe)) {
      return { found: true, path: dir, exe };
    }
    // Fallback: plain `steamcmd` binary (package-manager installs)
    if (!isWindows) {
      const plain = path.join(dir, "steamcmd");
      if (safeExists(plain)) {
        return { found: true, path: dir, exe: plain };
      }
    }
  }

  // System-wide binaries
  if (!isWindows) {
    for (const sysPath of ["/usr/games/steamcmd", "/usr/bin/steamcmd", "/usr/local/bin/steamcmd"]) {
      if (safeExists(sysPath)) {
        return { found: true, path: path.dirname(sysPath), exe: sysPath };
      }
    }
  }

  return { found: false };
}

/**
 * Detect existing PZ server installations at common paths.
 * @returns {Array<{ path: string, signatures: string[] }>}
 */
export function detectPzInstalls() {
  const candidates = [
    process.env.PZ_SERVER_PATH,
    ...(isWindows ? getWindowsPzPaths() : LINUX_PZ_PATHS),
  ].filter(Boolean);

  const results = [];
  const seen = new Set();

  for (const dir of candidates) {
    const resolved = safePath(dir);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);

    const signatures = PZ_SERVER_SIGNATURES.filter((sig) =>
      safeExists(path.join(resolved, sig)),
    );
    if (signatures.length > 0) {
      results.push({ path: resolved, signatures });
    }
  }

  return results;
}

/**
 * Suggest a default install path for a fresh PZ server install.
 * Picks the first writable path from platform defaults.
 * @returns {string}
 */
export function suggestInstallPath() {
  const documentsPath = path.join(os.homedir(), "Documents", "pz-server");
  const candidates = isWindows
    ? [documentsPath, "C:\\pz-server"]
    : ["/opt/pz-server", "/home/steam/pz-server", "/srv/pz-server"];

  for (const dir of candidates) {
    const parent = path.dirname(dir);
    if (safeWritable(parent)) return dir;
  }

  return isWindows ? documentsPath : "/opt/pz-server";
}

/**
 * Full auto-detection report for the setup wizard.
 * @returns {{
 *   steamCmd: { found: boolean, path?: string },
 *   existingInstalls: Array<{ path: string, signatures: string[] }>,
 *   suggestedInstallPath: string,
 *   platform: 'windows' | 'linux' | 'darwin',
 * }}
 */
export function detectSetupEnvironment() {
  const steamCmd = detectSteamCmd();
  const existingInstalls = detectPzInstalls();
  const suggested = suggestInstallPath();

  log.info(
    `Setup detection: SteamCMD ${steamCmd.found ? `at ${steamCmd.path}` : "not found"}, ` +
    `${existingInstalls.length} existing install(s), ` +
    `suggested path: ${suggested}`,
  );

  return {
    steamCmd,
    existingInstalls,
    suggestedInstallPath: suggested,
    platform: process.platform,
  };
}

// ── Internal ────────────────────────────────────────────────────────────

/**
 * Parse Steam's libraryfolders.vdf to discover Steam library paths on all
 * drives. VDF is a simple key-value format; we only need the "path" values.
 * Returns paths like ["C:\\Program Files (x86)\\Steam", "E:\\SteamLibrary"].
 */
function discoverSteamLibraryPaths() {
  if (!isWindows) return [];
  const vdfCandidates = [
    "C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf",
    "C:\\Program Files\\Steam\\steamapps\\libraryfolders.vdf",
  ];
  for (const vdfPath of vdfCandidates) {
    try {
      if (!fs.existsSync(vdfPath)) continue;
      const content = fs.readFileSync(vdfPath, "utf8");
      // Match "path"  "C:\\SteamLibrary" lines (VDF uses escaped backslashes)
      const paths = [];
      for (const match of content.matchAll(/"path"\s+"([^"]+)"/gi)) {
        paths.push(match[1].replace(/\\\\/g, "\\"));
      }
      if (paths.length > 0) {
        log.info(`Steam library folders: ${paths.join(", ")}`);
        return paths;
      }
    } catch {
      // VDF unreadable — skip
    }
  }
  return [];
}

/** Build PZ server candidate paths including all Steam library folders. */
function getWindowsPzPaths() {
  const base = [...WINDOWS_PZ_PATHS];
  for (const libPath of discoverSteamLibraryPaths()) {
    const pzPath = path.join(libPath, "steamapps", "common", "Project Zomboid Dedicated Server");
    if (!base.includes(pzPath)) base.push(pzPath);
  }
  return base;
}

function safeExists(filePath) {
  try { return fs.existsSync(filePath); } catch { return false; }
}

function safePath(dir) {
  try { return path.resolve(dir); } catch { return null; }
}

function safeWritable(dir) {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
