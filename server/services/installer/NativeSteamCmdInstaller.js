/**
 * NativeSteamCmdInstaller — installs/updates PZ server via a SteamCMD
 * child process on the host machine (Linux or Windows).
 *
 * Extracts the duplicated SteamCMD spawn logic from routes/server/install.js
 * and routes/server/steamUpdate.js into a testable service.
 */
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { Installer } from "./Installer.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("NativeSteamCmdInstaller");

const PZ_APP_ID = "380870";

export class NativeSteamCmdInstaller extends Installer {
  /**
   * @param {object} deps
   * @param {object} deps.steamCmd - SteamCMD helpers
   * @param {(p: string) => string} deps.steamCmd.getExe - resolve executable path
   * @param {(p: string, io?: object) => Promise<string>} deps.steamCmd.ensureLinux - auto-download on Linux
   * @param {(p: string) => boolean} deps.steamCmd.hasActiveOp - check for concurrent ops
   * @param {Map} deps.steamCmd.activeOps - active operation tracker
   * @param {(branch: string) => string[]} deps.steamCmd.getBetaArgs
   * @param {() => Promise<string[]>} deps.steamCmd.getLoginArgs
   * @param {(child: object, emitter: Function, event: string, opts?: object) => object} deps.steamCmd.attachStreaming
   * @param {(installPath: string, branch: string) => object|null} [deps.steamCmd.recoverManifest]
   * @param {boolean} [deps.isWindows]
   */
  constructor(deps) {
    super("NativeSteamCmdInstaller");
    this._deps = deps;
    this._isWindows = deps.isWindows ?? process.platform === "win32";
  }

  async isAvailable() {
    const { steamCmd } = this._deps;
    // Try configured path, then system-wide detection
    try {
      const exePath = steamCmd.getExe("");
      if (fs.existsSync(exePath)) {
        return { available: true };
      }
    } catch {
      // fall through
    }

    // On Linux, SteamCMD can be auto-downloaded
    if (!this._isWindows) {
      return { available: true, reason: "SteamCMD can be auto-downloaded" };
    }

    return {
      available: false,
      reason: "SteamCMD not found. Download it from https://developer.valvesoftware.com/wiki/SteamCMD",
    };
  }

  async install({ steamcmdPath, installPath, branch = "public", onProgress }) {
    const emit = makeEmitter(onProgress);

    const exeResult = await this._resolveExe(steamcmdPath, emit);
    if (!exeResult.success) return exeResult;

    const normalizedPath = path.normalize(installPath).toLowerCase();
    const concurrentCheck = this._checkConcurrent(normalizedPath);
    if (!concurrentCheck.success) return concurrentCheck;

    const { steamCmd } = this._deps;
    steamCmd.activeOps.set(normalizedPath, {
      type: "install",
      startTime: Date.now(),
      branch,
    });

    try {
      return await this._runSteamCmd({
        steamcmdExe: exeResult.exe,
        steamcmdPath,
        installPath,
        branch,
        operation: "install",
        normalizedPath,
        emit,
      });
    } catch (err) {
      steamCmd.activeOps.delete(normalizedPath);
      return { success: false, error: err.message };
    }
  }

  async update({ steamcmdPath, installPath, branch = "public", validate = false, onProgress }) {
    const emit = makeEmitter(onProgress);

    const exeResult = await this._resolveExe(steamcmdPath, emit);
    if (!exeResult.success) return exeResult;

    const normalizedPath = path.normalize(installPath).toLowerCase();
    const concurrentCheck = this._checkConcurrent(normalizedPath);
    if (!concurrentCheck.success) return concurrentCheck;

    const { steamCmd } = this._deps;
    const operation = validate ? "verification" : "update";

    // Recover mismatched branch manifest if switching branches
    if (steamCmd.recoverManifest) {
      try {
        const recovery = steamCmd.recoverManifest(installPath, branch);
        if (recovery) {
          log.warn(
            `Reset stale SteamCMD branch manifest (${recovery.mountedBranch} -> ${recovery.targetBranch})`,
          );
        }
      } catch (err) {
        log.warn(`Could not inspect SteamCMD branch manifest: ${err.message}`);
      }
    }

    steamCmd.activeOps.set(normalizedPath, {
      type: operation,
      startTime: Date.now(),
      branch,
    });

    try {
      return await this._runSteamCmd({
        steamcmdExe: exeResult.exe,
        steamcmdPath,
        installPath,
        branch,
        operation,
        normalizedPath,
        emit,
      });
    } catch (err) {
      steamCmd.activeOps.delete(normalizedPath);
      return { success: false, error: err.message };
    }
  }

  // ── Private ─────────────────────────────────────────────────────────

  async _resolveExe(steamcmdPath, emit) {
    const { steamCmd } = this._deps;

    let exe = steamCmd.getExe(steamcmdPath);
    if (fs.existsSync(exe)) return { success: true, exe };

    if (this._isWindows) {
      return { success: false, error: `SteamCMD not found at: ${exe}` };
    }

    // Auto-download on Linux
    try {
      emit("status", { status: "downloading", message: "SteamCMD missing — downloading..." });
      exe = await steamCmd.ensureLinux(steamcmdPath);
      return { success: true, exe };
    } catch (err) {
      return {
        success: false,
        error: `SteamCMD not found and auto-download failed: ${err.message}`,
      };
    }
  }

  _checkConcurrent(normalizedPath) {
    const { steamCmd } = this._deps;
    if (steamCmd.hasActiveOp(normalizedPath)) {
      return {
        success: false,
        error: "A Steam operation is already in progress for this path.",
      };
    }
    return { success: true };
  }

  async _runSteamCmd({ steamcmdExe, steamcmdPath, installPath, branch, operation, normalizedPath, emit, attempt = 1 }) {
    const { steamCmd } = this._deps;
    const MAX_RETRIES = 3;

    const betaArgs = steamCmd.getBetaArgs(branch);
    const loginArgs = await steamCmd.getLoginArgs();
    const args = [
      "+force_install_dir", installPath,
      ...loginArgs,
      "+app_update", PZ_APP_ID,
      ...betaArgs,
      "validate",
      "+quit",
    ];

    const spawnOpts = buildSpawnOpts(steamcmdPath, this._isWindows);
    const child = spawn(steamcmdExe, args, spawnOpts);

    const opRef = steamCmd.activeOps.get(normalizedPath);
    if (opRef) opRef.pid = child.pid;

    if (attempt === 1) {
      emit("start", {
        type: operation,
        message: `${capitalize(operation)} started...`,
      });
    }

    return new Promise((resolve) => {
      // attachStreaming expects an io-like object with .emit(eventName, data)
      const ioShim = { emit: (_, data) => emit("log", data) };
      const streaming = steamCmd.attachStreaming(child, ioShim, "log", {
        logFlush: operation === "install",
      });

      // Poll the install folder size every 5s as a progress fallback —
      // SteamCMD on Windows buffers stdout and may not emit download
      // percentages in real time.
      const sizePoller = startSizePoller(installPath, emit);

      child.on("close", async (code) => {
        sizePoller.stop();
        streaming.flush();

        // SteamCMD exit codes: 0 = success, 7 = success (common on
        // Windows — "CWorkThreadPool" cleanup race that fires after the
        // download/update has already completed successfully).
        const success = code === 0 || code === 7;
        const output = streaming.getOutput();

        if (success) {
          // Verify the server files actually exist on disk — SteamCMD
          // can exit 0 without writing anything in edge cases.
          const verified = verifyInstall(installPath);
          steamCmd.activeOps.delete(normalizedPath);
          if (!verified.ok) {
            emit("complete", { success: false, message: verified.reason });
            resolve({ success: false, error: verified.reason });
            return;
          }
          emit("complete", {
            success: true,
            message: `${capitalize(operation)} completed successfully`,
          });
          resolve({ success: true });
          return;
        }

        // Auto-retry on incomplete downloads (0x202 / 0x602) — SteamCMD
        // resumes where it left off, so retrying usually finishes the job.
        const isIncomplete = /state is 0x[26]02/i.test(output);
        if (isIncomplete && attempt < MAX_RETRIES) {
          emit("log", {
            type: "stdout",
            text: `Download incomplete — retrying (attempt ${attempt + 1}/${MAX_RETRIES})...`,
          });
          log.warn(`SteamCMD download incomplete, retrying (attempt ${attempt + 1}/${MAX_RETRIES})`);
          const retryResult = await this._runSteamCmd({
            steamcmdExe, steamcmdPath, installPath, branch,
            operation, normalizedPath, emit, attempt: attempt + 1,
          });
          resolve(retryResult);
          return;
        }

        steamCmd.activeOps.delete(normalizedPath);
        const detail = detectFailureReason(output, operation, code);
        emit("complete", { success: false, message: detail });
        resolve({ success: false, error: detail });
      });

      child.on("error", (err) => {
        sizePoller.stop();
        steamCmd.activeOps.delete(normalizedPath);
        const msg = `Failed to run SteamCMD: ${err.message}`;
        emit("complete", { success: false, message: msg });
        resolve({ success: false, error: msg });
      });
    });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function makeEmitter(onProgress) {
  return (event, data) => {
    try { onProgress?.(event, data); } catch { /* best effort */ }
  };
}

function buildSpawnOpts(steamcmdPath, isWindows) {
  const opts = { cwd: steamcmdPath };
  if (!isWindows) {
    const ldPaths = [
      path.join(steamcmdPath, "linux32"),
      path.join(steamcmdPath, "linux64"),
      steamcmdPath,
      process.env.LD_LIBRARY_PATH || "",
    ].filter(Boolean).join(":");
    opts.env = { ...process.env, LD_LIBRARY_PATH: ldPaths };
  }
  return opts;
}

function detectFailureReason(output, operation, code) {
  const steamDepotDenied =
    /app ['"]?380870['"]? state is 0x6/i.test(output) ||
    /manifest.*access denied/i.test(output);

  if (steamDepotDenied) {
    return "SteamCMD could not access a Project Zomboid depot manifest. " +
      "Your installed server files were not changed. Retry later; if it " +
      "persists, update using a Steam account that owns Project Zomboid.";
  }

  // 0x202 = "update required" — download was incomplete or interrupted.
  // 0x602 = same but with the "access denied" flag (partial + auth issue).
  const incompleteDownload =
    /state is 0x202/i.test(output) ||
    /state is 0x602/i.test(output);

  if (incompleteDownload) {
    return `Server ${operation} did not finish — SteamCMD's download was ` +
      "interrupted or incomplete. This usually resolves by retrying. " +
      "Check that you have at least 3 GB of free disk space.";
  }

  return `Server ${operation} failed with exit code ${code}`;
}

// PZ Build 42 dedicated server is ~7 GB.
const ESTIMATED_PZ_SIZE_BYTES = 7 * 1024 * 1024 * 1024;
const SIZE_POLL_INTERVAL_MS = 5000;

/** Poll the install folder size every few seconds and emit progress. */
function startSizePoller(installPath, emit) {
  let stopped = false;
  let lastSize = 0;

  const poll = async () => {
    if (stopped) return;
    try {
      const size = await getFolderSizeShallow(installPath);
      if (size > lastSize) {
        lastSize = size;
        const sizeMB = Math.round(size / (1024 * 1024));
        const pct = Math.min(99, Math.round((size / ESTIMATED_PZ_SIZE_BYTES) * 100));
        emit("log", {
          type: "stdout",
          text: `Downloading... ${sizeMB} MB downloaded (~${pct}%)`,
        });
      }
    } catch {
      // Folder may not exist yet — ignore
    }
    if (!stopped) timer = setTimeout(poll, SIZE_POLL_INTERVAL_MS);
  };

  let timer = setTimeout(poll, SIZE_POLL_INTERVAL_MS);
  return { stop: () => { stopped = true; clearTimeout(timer); } };
}

/** Quick folder size: sum file sizes one level deep in key subdirectories. */
async function getFolderSizeShallow(dir) {
  let total = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile()) {
        try { total += fs.statSync(full).size; } catch { /* skip */ }
      } else if (entry.isDirectory()) {
        // One level deep into key large directories
        try {
          const sub = fs.readdirSync(full, { withFileTypes: true });
          for (const s of sub) {
            if (s.isFile()) {
              try { total += fs.statSync(path.join(full, s.name)).size; } catch { /* skip */ }
            }
          }
        } catch { /* skip unreadable dirs */ }
      }
    }
  } catch { /* dir doesn't exist yet */ }
  return total;
}

/** Verify the PZ server files actually landed on disk after SteamCMD. */
function verifyInstall(installPath) {
  // Build 42 uses StartServer64.bat + projectzomboid.jar (no .exe).
  // Build 41 used ProjectZomboid64.exe / start-server.bat / start-server.sh.
  const signatures = [
    "StartServer64.bat",
    "projectzomboid.jar",
    "ProjectZomboid64.exe",
    "ProjectZomboid64",
    "start-server.bat",
    "start-server.sh",
  ];

  const found = signatures.some((f) =>
    fs.existsSync(path.join(installPath, f)),
  );

  if (!found) {
    return {
      ok: false,
      reason: `SteamCMD exited successfully but the server files were not found at ${installPath}. ` +
        "The download may have been incomplete. Try running the install again — SteamCMD will resume where it left off.",
    };
  }

  // jre64 is required — PZ bundles its own JVM
  const hasJre = fs.existsSync(path.join(installPath, "jre64"));
  if (!hasJre) {
    return {
      ok: false,
      reason: `Server files exist but the bundled Java runtime (jre64/) is missing at ${installPath}. ` +
        "The download was likely incomplete. Try running the install again.",
    };
  }

  return { ok: true };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
