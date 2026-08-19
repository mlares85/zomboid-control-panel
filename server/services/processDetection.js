// Platform-specific detection of running Project Zomboid dedicated server
// processes (pgrep/ps on Linux/macOS, WMI/CIM on Windows), plus the
// heuristics used to attribute a matched process to a particular configured
// server. Extracted from ServerManager so the (large, battle-tested) scan
// logic can be tested and read independently of process lifecycle concerns.
import { exec } from "child_process";
import { createLogger } from "../utils/logger.js";

const log = createLogger("ProcessDetection");
const isWindows = process.platform === "win32";

export function isWindowsDedicatedServerCommandLine(commandLine) {
  const normalized =
    typeof commandLine === "string" ? commandLine.toLowerCase() : "";
  if (!normalized) return false;

  // 1. Direct Java execution
  if (normalized.includes("zombie.network.gameserver")) {
    return true;
  }

  // 2. Native Launcher (Wrappers like WinGSM often call these with specific flags)
  if (
    normalized.includes("projectzomboid64.exe") ||
    normalized.includes("projectzomboid32.exe")
  ) {
    if (
      normalized.includes("-server") ||
      normalized.includes("startserver") ||
      normalized.includes("-servername")
    ) {
      return true;
    }
  }

  // 3. Fallback for custom generic setups (must explicitly name Zomboid)
  if (
    normalized.includes("zomboid") &&
    (normalized.includes("-server") || normalized.includes("startserver"))
  ) {
    return true;
  }

  return false;
}

// Linux/macOS mirror of isWindowsDedicatedServerCommandLine — same
// heuristics so a player running the *game* (ProjectZomboid64) on the same
// box doesn't false-positive as a running dedicated server.
function isLinuxDedicatedServerCommandLine(cmd) {
  const lower = String(cmd || "").toLowerCase();
  if (!lower) return false;
  if (lower.includes("zombie.network.gameserver")) return true;
  if (
    lower.includes("projectzomboid64") ||
    lower.includes("projectzomboid32")
  ) {
    return (
      lower.includes("-server") ||
      lower.includes("startserver") ||
      lower.includes("-servername")
    );
  }
  return (
    lower.includes("zomboid") &&
    (lower.includes("-server") || lower.includes("startserver"))
  );
}

// Pull the value of a PZ launch argument (`-servername X`, `-cachedir="Y"`)
// out of a raw command line.
export function extractLaunchArgValue(commandLine, flag) {
  const pattern = new RegExp(
    `(?:^|\\s)-${flag}(?:\\s*=\\s*|\\s+)("[^"]*"|'[^']*'|\\S+)`,
    "i",
  );
  const match = String(commandLine || "").match(pattern);
  if (!match) return null;
  const value = match[1].replace(/^["']|["']$/g, "").trim();
  return value || null;
}

export function normalizePathForCompare(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/[\\/]+/g, "/")
    .replace(/\/+$/, "");
  return isWindows ? normalized.toLowerCase() : normalized;
}

/**
 * How strongly a running process looks like it belongs to a given server.
 * Returns -1 when a launch argument proves it belongs to a DIFFERENT server,
 * 0 when the command line carries no identifying argument at all (so it
 * can't be attributed either way), and a positive score when it matches.
 *
 * This is what lets one host run several dedicated servers: the panel writes
 * `-servername` (and usually `-cachedir`) into every startup script it
 * generates, so each process names the server it belongs to.
 */
export function scoreServerProcessOwnership(commandLine, descriptor = {}) {
  const cmd = String(commandLine || "");
  if (!cmd) return 0;

  let score = 0;

  const nameArg = extractLaunchArgValue(cmd, "servername");
  if (nameArg && descriptor.serverName) {
    if (nameArg.toLowerCase() !== String(descriptor.serverName).toLowerCase()) {
      return -1;
    }
    score += 3;
  }

  const cacheArg = extractLaunchArgValue(cmd, "cachedir");
  if (cacheArg && descriptor.savePath) {
    if (
      normalizePathForCompare(cacheArg) !==
      normalizePathForCompare(descriptor.savePath)
    ) {
      return -1;
    }
    score += 2;
  }

  const installPath = normalizePathForCompare(descriptor.serverPath);
  if (installPath && normalizePathForCompare(cmd).includes(installPath)) {
    score += 1;
  }

  return score;
}

// Keep the command line intact: ownership matching needs the -servername /
// -cachedir arguments, which sit well past 240 chars.
function toMatchEntry(cmd, pid) {
  const full = String(cmd || "");
  return pid ? { pid: String(pid), cmd: full } : { cmd: full };
}

function parseWindowsCsvOutput(psStdout) {
  const matched = [];
  for (let raw of psStdout.split(/\r?\n/)) {
    raw = raw.trim();
    if (!raw || raw.startsWith('"ProcessId"')) continue;
    // CSV: "<pid>","<cmd>" — strip outer quotes / un-double internal "" pairs.
    const csvMatch = raw.match(/^"([^"]*)","((?:[^"]|"")*)"$/);
    if (!csvMatch) continue;
    const pid = csvMatch[1];
    const cmd = csvMatch[2].replace(/""/g, '"');
    if (!cmd || !isWindowsDedicatedServerCommandLine(cmd)) continue;
    log.debug(
      `process scan: matched PZ server process pid=${pid}: ${cmd.substring(0, 200)}`,
    );
    matched.push(toMatchEntry(cmd, pid));
  }
  return matched;
}

function scanWindowsProcesses(settle) {
  const psCmd =
    "powershell -Command \"Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(java\\.exe|ProjectZomboid64\\.exe|ProjectZomboid32\\.exe)$' } | Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation\"";
  exec(psCmd, { timeout: 8000 }, (psError, psStdout) => {
    if (psError || !psStdout) {
      settle({ running: false, matched: [], scanFailed: true });
      return;
    }
    const matched = parseWindowsCsvOutput(psStdout);
    settle({ running: matched.length > 0, matched });
  });
}

function parsePgrepOutput(pgrepOut) {
  const matched = [];
  for (const line of pgrepOut.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // pgrep -af format: "<pid> <cmdline>"
    const m = trimmed.match(/^(\d+)\s+(.*)$/);
    const pid = m ? m[1] : undefined;
    const cmd = m ? m[2] : trimmed;
    if (!isLinuxDedicatedServerCommandLine(cmd)) continue;
    matched.push(toMatchEntry(cmd, pid));
  }
  return matched;
}

// Skip our own grep / pgrep / ps invocations showing up in `ps aux`.
function isCandidatePsAuxLine(line) {
  const lower = line.toLowerCase();
  if (
    !lower.includes("zombie.network.gameserver") &&
    !lower.includes("projectzomboid64") &&
    !lower.includes("projectzomboid32")
  ) {
    return false;
  }
  if (
    /\b(ps|pgrep|grep)\b.*\b(zombie|projectzomboid)/.test(lower) &&
    !lower.includes("java") &&
    !lower.includes("-server")
  ) {
    return false;
  }
  return true;
}

function parsePsAuxOutput(stdout) {
  const matched = [];
  // ps aux columns: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
  const columnPattern =
    /^\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(.*)$/;
  for (const line of stdout.split(/\r?\n/)) {
    if (!isCandidatePsAuxLine(line)) continue;
    const m = line.trim().match(columnPattern);
    const pid = m ? m[1] : undefined;
    const cmd = m ? m[2] : line.trim();
    if (!isLinuxDedicatedServerCommandLine(cmd)) continue;
    matched.push(toMatchEntry(cmd, pid));
  }
  return matched;
}

function scanLinuxViaPsAux(settle) {
  log.debug(
    "process scan: pgrep failed or empty, falling back to ps aux -ww",
  );
  exec("ps aux -ww", { timeout: 8000 }, (err, stdout) => {
    if (err || !stdout) {
      settle({ running: false, matched: [], scanFailed: true });
      return;
    }
    const matched = parsePsAuxOutput(stdout);
    settle({ running: matched.length > 0, matched });
  });
}

function scanLinuxProcesses(settle) {
  // pgrep first (faster, more reliable), fall back to ps aux -ww.
  log.debug("process scan: trying pgrep -af first...");
  const pgrepCmd =
    'pgrep -af "zombie.network.[Gg]ame[Ss]erver|[Pp]roject[Zz]omboid64|[Pp]roject[Zz]omboid32"';
  exec(pgrepCmd, { timeout: 8000 }, (pgrepErr, pgrepOut) => {
    if (!pgrepErr && pgrepOut && pgrepOut.trim()) {
      const matched = parsePgrepOutput(pgrepOut);
      settle({ running: matched.length > 0, matched });
      return;
    }
    scanLinuxViaPsAux(settle);
  });
}

// Raw OS scan: every Project Zomboid dedicated server process on this host,
// regardless of which configured server it belongs to (ownership is decided
// afterwards by scoring each match against `descriptor` with
// scoreServerProcessOwnership). Resolves within 10s even if the OS command
// hangs, so callers never block indefinitely on a stuck `exec`.
export async function scanDedicatedServerProcesses(descriptor) {
  log.debug(
    `process scan: starting detection (platform=${process.platform}, server=${descriptor?.serverName || "unknown"})`,
  );
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      log.warn(
        "process scan: timed out, assuming server is not running",
      );
      resolve({ running: false, matched: [], scanFailed: true });
    }, 10000);

    const settle = (result) => {
      clearTimeout(timeout);
      resolve(result);
    };

    if (isWindows) {
      scanWindowsProcesses(settle);
    } else {
      scanLinuxProcesses(settle);
    }
  });
}
