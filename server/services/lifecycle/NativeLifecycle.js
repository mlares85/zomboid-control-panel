/**
 * NativeLifecycle — starts/stops a PZ server running as a native child process.
 *
 * Extracted from ServerManager's native startServer()/stopServer() paths:
 *   - launch()       ← the spawn() calls in startServer()
 *   - terminate()    ← ServerManager._killPids()
 *   - terminateAll() ← ServerManager._genericForceStop()
 *
 * ServerManager still owns PID detection (getServerProcessDetails, WMI/pgrep
 * scanning) and config assembly (custom start commands, LD_LIBRARY_PATH,
 * default startup scripts) — those stay server-specific. NativeLifecycle
 * only does the mechanical part: spawn a process, kill given PIDs, or force
 * kill anything PZ-shaped.
 */
import {
  spawn as defaultSpawn,
  execFile as defaultExecFile,
  exec as defaultExec,
} from "child_process";
import defaultFs from "fs";
import { Lifecycle } from "./Lifecycle.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("NativeLifecycle");

export class NativeLifecycle extends Lifecycle {
  /**
   * @param {object} [deps]
   * @param {boolean} [deps.isWindows]
   * @param {Function} [deps.spawn] - child_process.spawn
   * @param {Function} [deps.execFile] - child_process.execFile
   * @param {Function} [deps.exec] - child_process.exec
   * @param {object} [deps.fs] - filesystem (existsSync, openSync, closeSync, ...)
   */
  constructor(deps = {}) {
    super("NativeLifecycle");
    this._isWindows = deps.isWindows ?? process.platform === "win32";
    this._spawn = deps.spawn ?? defaultSpawn;
    this._execFile = deps.execFile ?? defaultExecFile;
    this._exec = deps.exec ?? defaultExec;
    this._fs = deps.fs ?? defaultFs;
  }

  /**
   * Spawn the server process. The caller builds the full launch config
   * (custom vs default startup command, LD_LIBRARY_PATH, cwd) — this just
   * runs it.
   * @param {object} config
   * @param {string} config.command
   * @param {string[]} [config.args]
   * @param {string} [config.cwd]
   * @param {object} [config.env]
   * @param {boolean} [config.detached]
   * @param {string} [config.logPath] - file to redirect stdout/stderr into
   * @returns {Promise<{success: boolean, pid?: number, process?: object, error?: string}>}
   */
  async launch({ command, args = [], cwd, env, detached = true, logPath } = {}) {
    try {
      if (!command) return { success: false, error: "No command specified" };
      if (!this._isSystemCommand(command) && !this._fs.existsSync(command)) {
        return { success: false, error: `Command not found: ${command}` };
      }
      const stdio = ["ignore", ...this._openLogFd(logPath, 2)];

      const child = this._spawn(command, args, {
        cwd,
        detached,
        stdio,
        env: env || process.env,
      });
      this._closeLogFd(stdio[1]);

      child.on("error", (err) => {
        log.error(`Server process error: ${err.message}`);
      });
      if (detached) child.unref();

      return { success: true, pid: child.pid, process: child };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Force-kill specific PIDs (owned by the caller's server). Never throws.
   * @param {(string|number)[]} pids
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  async terminate(pids) {
    if (!pids || pids.length === 0) {
      return { success: true, message: "No PIDs to terminate" };
    }
    try {
      await this._killPids(pids.map(String));
      return { success: true, message: `Terminated PIDs: ${pids.join(", ")}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Fallback generic force kill of anything PZ-shaped. Used when PID
   * detection fails and there's only one local server to worry about.
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  async terminateAll() {
    try {
      await this._genericForceKill();
      return { success: true, message: "Force kill executed" };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Not implemented at this level — process detection (matching a running
   * process to a specific server by name/cwd, with pgrep/WMI fallbacks) is
   * complex and stays in ServerManager for now. Known gap, to be closed
   * once the full provider registry is wired.
   * @returns {Promise<boolean>}
   */
  async isRunning() {
    return false;
  }

  /** @private */
  _killPids(pids) {
    return new Promise((resolve) => {
      if (this._isWindows) {
        let remaining = pids.length;
        for (const pid of pids) {
          this._execFile("taskkill", ["/PID", pid, "/F"], (err) => {
            if (err) log.debug(`taskkill ${pid}: ${err.message}`);
            if (--remaining === 0) resolve();
          });
        }
        return;
      }
      this._execFile("kill", ["-9", ...pids], (err) => {
        if (err) log.warn(`kill returned error (may be normal): ${err.message}`);
        resolve();
      });
    });
  }

  /** @private */
  _genericForceKill() {
    return new Promise((resolve) => {
      if (this._isWindows) {
        this._exec("taskkill /IM ProjectZomboid64.exe /F", () => {
          this._exec(
            "powershell -Command \"Get-CimInstance Win32_Process -Filter \\\"Name='java.exe'\\\" | Where-Object { $_.CommandLine -like '*zombie.network.gameserver*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }\"",
            () => resolve(),
          );
        });
        return;
      }
      this._exec(
        "pkill -9 -f 'zombie.network.[Gg]ame[Ss]erver|[Pp]roject[Zz]omboid64|[Pp]roject[Zz]omboid32'",
        () => resolve(),
      );
    });
  }

  /** @private opens a log fd for stdout/stderr, falling back to "ignore" */
  _openLogFd(logPath, count) {
    let fd = "ignore";
    if (logPath) {
      try {
        fd = this._fs.openSync(logPath, "w");
      } catch (e) {
        log.debug(`Could not open launch log ${logPath}: ${e.message}`);
        fd = "ignore";
      }
    }
    return Array(count).fill(fd);
  }

  /** @private closes our copy of the log fd (the child keeps its own) */
  _closeLogFd(fd) {
    if (typeof fd !== "number") return;
    try {
      this._fs.closeSync(fd);
    } catch (e) {
      log.debug(`Could not close launch log fd: ${e.message}`);
    }
  }

  /** @private commands that don't live at a filesystem path (resolved via PATH) */
  _isSystemCommand(cmd) {
    return cmd === "cmd.exe" || cmd === "bash" || cmd === "/bin/bash";
  }
}
