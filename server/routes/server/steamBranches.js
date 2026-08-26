// Steam branch selection/parsing, concurrent-operation tracking, and the
// shared SteamCMD stdout/stderr line-streaming helper. Split out of
// steamcmd.js (which owns locating/downloading the SteamCMD binary) to keep
// each file under the line limit.
import path from "path";
import fs from "fs";
import { createLogger } from "../../utils/logger.js";
import { getSetting } from "../../database/init.js";

const log = createLogger("API:Server");

export function normalizeSteamBranch(branch) {
  return !branch || branch === "stable" || branch === "public"
    ? "public"
    : branch;
}

export function recoverMismatchedSteamBranchManifest(installPath, selectedBranch) {
  const manifestPath = path.join(
    installPath,
    "steamapps",
    "appmanifest_380870.acf",
  );
  if (!fs.existsSync(manifestPath)) return null;

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  const mountedBranch = manifest.match(
    /"MountedConfig"\s*\{[\s\S]*?"BetaKey"\s*"([^"]+)"/,
  )?.[1];
  const targetBranch = normalizeSteamBranch(selectedBranch);
  if (!mountedBranch || mountedBranch === targetBranch) return null;

  const backupPath = `${manifestPath}.bak-${Date.now()}`;
  fs.copyFileSync(manifestPath, backupPath);
  fs.unlinkSync(manifestPath);
  return { mountedBranch, targetBranch, backupPath };
}

// Track active Steam operations to prevent concurrent runs on the same path
export const activeSteamOperations = new Map();

export function hasActiveSteamOperation(normalizedPath) {
  const operation = activeSteamOperations.get(normalizedPath);
  if (!operation) return false;

  if (Number.isInteger(operation.pid)) {
    try {
      process.kill(operation.pid, 0);
      return true;
    } catch (error) {
      if (error.code === "ESRCH") {
        activeSteamOperations.delete(normalizedPath);
        log.warn(
          `Cleared stale Steam ${operation.type} operation for ${normalizedPath}`,
        );
        return false;
      }
    }
  }

  return true;
}

// Fallback branches if dynamic fetch fails
// These are the known valid Steam branches for PZ Dedicated Server (App ID 380870)
export const FALLBACK_BRANCHES = [
  { name: "public", description: "Current stable release. Recommended for most servers." },
  { name: "unstable", description: "Build 42 testing branch, including multiplayer. Back up saves and expect mod incompatibilities." },
  { name: "iwbums", description: "Experimental testing branch. Back up saves before switching." },
  { name: "legacy41", description: "Legacy Build 41 branch for older worlds and mods." },
];

// Parse Steam app_info output to extract branches
export function parseSteamBranches(output) {
  const branches = [];

  try {
    // Look for the "branches" section in VDF format
    // Format is like:
    // "branches"
    // {
    //   "public"
    //   {
    //     "buildid" "12345"
    //     "timeupdated" "1234567890"
    //   }
    //   "unstable"
    //   {
    //     "buildid" "12346"
    //     "description" "Build 42"
    //     ...
    //   }
    // }

    const branchesMatch = output.match(/"branches"\s*\{([^]*?)\n\t\t\}/);
    const altMatch = !branchesMatch
      ? output.match(/"branches"\s*\{([^]*?)\}\s*"installedrepots"/i)
      : null;

    if (!branchesMatch && !altMatch) {
      return branches;
    }

    const branchesSection = (branchesMatch || altMatch)[1];

    // Extract individual branch names and their properties
    // Match pattern: "branchname" followed by { ... }
    const branchRegex = /^\s*"([^"]+)"\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gm;
    let match;

    while ((match = branchRegex.exec(branchesSection)) !== null) {
      const branchName = match[1];
      const branchContent = match[2];

      // Skip password-protected branches
      if (
        branchContent.includes('"pwdrequired"') &&
        branchContent.includes('"1"')
      ) {
        continue;
      }

      // Extract description if available
      const descMatch = branchContent.match(/"description"\s+"([^"]+)"/);
      const description = descMatch
        ? descMatch[1]
        : branchName === "public"
          ? "Default stable branch"
          : "";

      // Extract buildid for reference
      const buildMatch = branchContent.match(/"buildid"\s+"(\d+)"/);
      const buildId = buildMatch ? buildMatch[1] : null;

      // Extract time updated
      const timeMatch = branchContent.match(/"timeupdated"\s+"(\d+)"/);
      const timeUpdated = timeMatch
        ? new Date(parseInt(timeMatch[1], 10) * 1000).toISOString()
        : null;

      branches.push({
        name: branchName,
        description: description || branchName,
        buildId,
        timeUpdated,
      });
    }

    // Sort: public first, then alphabetically
    branches.sort((a, b) => {
      if (a.name === "public") return -1;
      if (b.name === "public") return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    log.warn(`Failed to parse Steam branches: ${err.message}`);
  }

  return branches;
}

// Helper to build Steam beta arguments as array
export function getBetaArgs(branch) {
  if (!branch || branch === "stable" || branch === "public") return [];
  // Backwards compatibility: treat boolean true as 'unstable'
  if (branch === true) return ["-beta", "unstable"];
  // Allow any branch name - Steam will validate it
  return ["-beta", branch];
}

export async function getSteamLoginArgs() {
  const account = String((await getSetting("steamUpdateAccount")) || "").trim();
  return ["+login", account || "anonymous"];
}

// Wires stdout/stderr line-buffered streaming for a spawned SteamCMD child
// process: splits on newlines, keeps the trailing partial line buffered, and
// emits+logs each complete line as it arrives. Used identically by /install
// and /steam-update. `logFlush` matches each call site's original behavior:
// /install additionally log.info/log.warn's the leftover buffer on flush,
// /steam-update does not.
export function attachSteamCmdLineStreaming(child, io, eventName, { logFlush = false } = {}) {
  let output = "";
  let stdoutBuffer = "";
  let stderrBuffer = "";

  // SteamCMD on Windows uses bare \r (carriage return) for download progress
  // lines to overwrite the same console line. Split on \r, \n, or \r\n so
  // progress updates are emitted in real time instead of buffering until exit.
  const LINE_SPLIT = /\r\n|\r|\n/;

  child.stdout.on("data", (data) => {
    const text = data.toString();
    output += text;
    stdoutBuffer += text;
    const lines = stdoutBuffer.split(LINE_SPLIT);
    stdoutBuffer = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) {
        io.emit(eventName, { type: "stdout", text: line });
        log.info(`SteamCMD: ${line}`);
      }
    }
  });

  child.stderr.on("data", (data) => {
    const text = data.toString();
    output += text;
    stderrBuffer += text;
    const lines = stderrBuffer.split(LINE_SPLIT);
    stderrBuffer = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) {
        io.emit(eventName, { type: "stderr", text: line });
        log.warn(`SteamCMD stderr: ${line}`);
      }
    }
  });

  return {
    getOutput: () => output,
    flush: () => {
      if (stdoutBuffer.trim()) {
        io.emit(eventName, { type: "stdout", text: stdoutBuffer.trim() });
        if (logFlush) log.info(`SteamCMD: ${stdoutBuffer.trim()}`);
      }
      if (stderrBuffer.trim()) {
        io.emit(eventName, { type: "stderr", text: stderrBuffer.trim() });
        if (logFlush) log.warn(`SteamCMD stderr: ${stderrBuffer.trim()}`);
      }
    },
  };
}
