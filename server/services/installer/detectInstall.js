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
  "ProjectZomboid64",
  "ProjectZomboid64.exe",
  "start-server.sh",
  "start-server.bat",
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
    ...(isWindows ? WINDOWS_PZ_PATHS : LINUX_PZ_PATHS),
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
