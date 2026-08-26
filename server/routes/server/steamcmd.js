// Locating the SteamCMD binary and self-healing a missing install on Linux.
// Branch selection/parsing and the shared streaming helper live in
// steamBranches.js (kept separate to stay under the file line limit); this
// module re-exports them so existing imports of "./steamcmd.js" keep working.
import { spawn, exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import { createLogger } from "../../utils/logger.js";
import { getSetting } from "../../database/init.js";
import { isWindows } from "./shared.js";

export {
  normalizeSteamBranch,
  recoverMismatchedSteamBranchManifest,
  activeSteamOperations,
  hasActiveSteamOperation,
  FALLBACK_BRANCHES,
  parseSteamBranches,
  getBetaArgs,
  getSteamLoginArgs,
  attachSteamCmdLineStreaming,
} from "./steamBranches.js";
export { isWindows };

const log = createLogger("API:Server");
const execAsync = promisify(exec);

// Get the SteamCMD executable name for the current platform
export function getSteamCmdExe(steamcmdPath) {
  const primary = path.join(
    steamcmdPath,
    isWindows ? "steamcmd.exe" : "steamcmd.sh",
  );
  if (fs.existsSync(primary)) return primary;
  // Fallback: plain 'steamcmd' binary (package-manager installs on Linux)
  const fallback = path.join(steamcmdPath, "steamcmd");
  if (!isWindows && fs.existsSync(fallback)) return fallback;
  // System-wide fallback (CentOS/Ubuntu package manager installs)
  if (!isWindows) {
    for (const sysPath of [
      "/usr/games/steamcmd",
      "/usr/bin/steamcmd",
      "/usr/local/bin/steamcmd",
    ]) {
      if (fs.existsSync(sysPath)) return sysPath;
    }
  }
  return primary; // Return primary path even if not found — let caller handle the error
}

// Self-heal "SteamCMD not found": downloads, extracts and first-time
// initializes SteamCMD into `installPath` on Linux, mirroring the same
// steps as POST /steamcmd/download. Called from /install and /update when
// the configured steamcmdPath is empty — e.g. a fresh volume, or a
// previous install attempt that never finished (permission error, network
// blip, container restarted mid-download, etc.) instead of hard-failing
// with a 400 and making the user manually re-run the setup wizard.
// Windows is intentionally out of scope here (existing callers already
// keep their own hard-fail for isWindows before calling this).
export async function ensureSteamCmdLinux(installPath, io) {
  const steamcmdExe = getSteamCmdExe(installPath);
  if (fs.existsSync(steamcmdExe)) return steamcmdExe;

  const emit = (event, payload) => {
    try {
      io?.emit(event, payload);
    } catch {
      /* best effort */
    }
  };

  log.warn(
    `SteamCMD not found at ${steamcmdExe}; auto-downloading to ${installPath}...`,
  );
  emit("steamcmd:status", {
    status: "downloading",
    message: "SteamCMD missing — downloading it now...",
  });

  if (!fs.existsSync(installPath)) {
    fs.mkdirSync(installPath, { recursive: true });
  }

  const tarUrl =
    "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz";
  const tarPath = path.join(installPath, "steamcmd_linux.tar.gz");
  const safeTarPath = tarPath.replace(/'/g, "'\\''");
  const safeTarUrl = tarUrl.replace(/'/g, "'\\''");
  const safeInstallPath = installPath.replace(/'/g, "'\\''");

  try {
    await execAsync(`curl -sSL -o '${safeTarPath}' '${safeTarUrl}'`, {
      timeout: 120000,
    });
  } catch (curlErr) {
    log.warn(`curl download failed (${curlErr.message}), trying wget...`);
    await execAsync(`wget -q -O '${safeTarPath}' '${safeTarUrl}'`, {
      timeout: 120000,
    });
  }

  emit("steamcmd:status", {
    status: "extracting",
    message: "Extracting SteamCMD...",
  });
  await execAsync(`tar -xzf '${safeTarPath}' -C '${safeInstallPath}'`, {
    timeout: 30000,
  });
  try {
    fs.unlinkSync(tarPath);
  } catch {
    /* ignore */
  }
  try {
    fs.chmodSync(path.join(installPath, "steamcmd.sh"), 0o755);
  } catch {
    /* ignore */
  }
  try {
    fs.chmodSync(path.join(installPath, "steamcmd"), 0o755);
  } catch {
    /* ignore */
  }

  emit("steamcmd:status", {
    status: "initializing",
    message: "Initializing SteamCMD (first run)...",
  });
  const ldPaths = [
    path.join(installPath, "linux32"),
    path.join(installPath, "linux64"),
    installPath,
    process.env.LD_LIBRARY_PATH || "",
  ]
    .filter(Boolean)
    .join(":");

  await new Promise((resolve, reject) => {
    const proc = spawn(steamcmdExe, ["+quit"], {
      cwd: installPath,
      env: { ...process.env, LD_LIBRARY_PATH: ldPaths },
    });
    proc.stdout.on("data", (d) =>
      emit("steamcmd:log", { type: "stdout", text: d.toString() }),
    );
    proc.stderr.on("data", (d) =>
      emit("steamcmd:log", { type: "stderr", text: d.toString() }),
    );
    proc.on("close", (code) => {
      if (code === 0 || code === 7) {
        resolve();
      } else {
        reject(new Error(`SteamCMD first-run setup exited with code ${code}`));
      }
    });
    proc.on("error", reject);
  });

  if (!fs.existsSync(steamcmdExe)) {
    throw new Error(
      `SteamCMD download completed but ${steamcmdExe} still missing`,
    );
  }

  emit("steamcmd:status", {
    status: "complete",
    message: "SteamCMD installed successfully!",
    path: installPath,
  });
  log.info(`SteamCMD auto-installed to ${installPath}`);
  return steamcmdExe;
}

export async function findSteamCmdPath() {
  const configuredPath = await getSetting("steamcmdPath");
  const windowsPaths = isWindows ? [
    path.join(os.homedir(), "Documents", "SteamCMD"),
    "C:\\steamcmd",
    "C:\\SteamCMD",
    path.join(process.env.USERPROFILE || "C:\\Users\\Default", "steamcmd"),
    "C:\\Program Files\\SteamCMD",
  ] : [];
  const linuxPaths = isWindows ? [] : [
    "/home/steam/steamcmd",
    "/home/steam/Steam/steamcmd",
    "/opt/steamcmd",
  ];
  const candidates = [
    configuredPath,
    process.env.STEAMCMD_PATH,
    ...windowsPaths,
    ...linuxPaths,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(getSteamCmdExe(candidate))) return candidate;
  }

  return null;
}
