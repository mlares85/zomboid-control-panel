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

  async _runSteamCmd({ steamcmdExe, steamcmdPath, installPath, branch, operation, normalizedPath, emit }) {
    const { steamCmd } = this._deps;

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

    emit("start", {
      type: operation,
      message: `${capitalize(operation)} started...`,
    });

    return new Promise((resolve) => {
      const streaming = steamCmd.attachStreaming(child, emit, "log", {
        logFlush: operation === "install",
      });

      child.on("close", (code) => {
        streaming.flush();
        steamCmd.activeOps.delete(normalizedPath);

        const success = code === 0;
        const output = streaming.getOutput();

        if (success) {
          emit("complete", {
            success: true,
            message: `${capitalize(operation)} completed successfully`,
          });
          resolve({ success: true });
        } else {
          const detail = detectFailureReason(output, operation, code);
          emit("complete", { success: false, message: detail });
          resolve({ success: false, error: detail });
        }
      });

      child.on("error", (err) => {
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

  return `Server ${operation} failed with exit code ${code}`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
