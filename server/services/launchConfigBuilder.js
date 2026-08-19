import path from "path";
import fs from "fs";
import { createLogger } from "../utils/logger.js";

const log = createLogger("LaunchConfig");

const isWindows = process.platform === "win32";
// Allowed extensions for custom start commands
const ALLOWED_CMD_EXTENSIONS = isWindows
  ? [".bat", ".cmd", ".exe"]
  : [".sh", ""];

// Build LD_LIBRARY_PATH from server directory, filtering to only existing paths
export function buildLdLibraryPath(serverDir) {
  log.debug(
    `buildLdLibraryPath: scanning candidates for serverDir=${serverDir}`,
  );
  const candidates = [
    path.join(serverDir, "linux64"),
    path.join(serverDir, "natives", "linux64"),
    path.join(serverDir, "natives"),
    serverDir,
    path.join(serverDir, "jre64", "lib", "amd64"),
    path.join(serverDir, "jre64", "lib", "x86_64"), // CentOS uses x86_64 instead of amd64
    "/usr/lib64", // CentOS system 64-bit libs
  ];
  const existing = candidates.filter((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
  const extra = process.env.LD_LIBRARY_PATH || "";
  const result = [...existing, extra].filter(Boolean).join(":");
  log.debug(
    `buildLdLibraryPath: ${existing.length}/${candidates.length} dirs exist → LD_LIBRARY_PATH=${result}`,
  );
  return result;
}

// Validate a custom start command string for safety
export function validateStartCommand(cmd) {
  if (!cmd || typeof cmd !== "string")
    return { valid: false, reason: "Command is empty" };
  if (cmd.length > 1024)
    return { valid: false, reason: "Command exceeds 1024 characters" };
  // Block obvious shell metacharacters that enable chaining/injection
  // Allow quotes, spaces, hyphens, equals, slashes, dots, colons (drive letters)
  if (/[&|;<>`${}()!\[\]\n\r]/.test(cmd)) {
    return {
      valid: false,
      reason:
        "Command contains disallowed shell characters: & | ; < > ` $ { } ( ) ! [ ]",
    };
  }
  return { valid: true };
}

// Windows .bat/.cmd → wrap with cmd.exe. Linux .sh → wrap with bash and set
// LD_LIBRARY_PATH so the JVM can find bundled native libs. Anything else
// (e.g. a resolved .exe) is spawned directly.
function platformSpawnConfig({ resolvedCmd, args, cwd, ext }) {
  if (isWindows && (ext === ".bat" || ext === ".cmd")) {
    return { command: "cmd.exe", args: ["/c", resolvedCmd, ...args], cwd };
  }
  if (!isWindows && ext === ".sh") {
    try {
      fs.chmodSync(resolvedCmd, 0o750);
    } catch (e) {
      log.debug(`chmod on .sh failed: ${e.message}`);
    }
    const ldPath = buildLdLibraryPath(path.resolve(cwd));
    return {
      command: "bash",
      args: [resolvedCmd, ...args],
      cwd,
      env: { ...process.env, LD_LIBRARY_PATH: ldPath },
    };
  }
  const env = isWindows
    ? process.env
    : { ...process.env, LD_LIBRARY_PATH: buildLdLibraryPath(path.resolve(cwd)) };
  return { command: resolvedCmd, args, cwd, env };
}

// Custom start command — split into command + args, validate, resolve to an
// absolute path on disk, and build a platform-appropriate spawn config.
function buildCustomCommandConfig({ startCommand, serverPath }) {
  const validation = validateStartCommand(startCommand);
  if (!validation.valid) {
    return { error: `Invalid start command: ${validation.reason}` };
  }

  const parts = startCommand.match(/(?:[^\s"]+|"[^"]*")+/g) || [startCommand];
  const cmd = parts[0].replace(/^"|"$/g, "");
  const args = parts.slice(1).map((a) => a.replace(/^"|"$/g, ""));
  const cwd = serverPath || path.dirname(path.resolve(cmd));

  const ext = path.extname(cmd).toLowerCase();
  if (!ALLOWED_CMD_EXTENSIONS.includes(ext)) {
    return {
      error: `Start command has disallowed extension '${ext}'. Allowed: ${ALLOWED_CMD_EXTENSIONS.join(", ")}`,
    };
  }

  const resolvedCmd = path.isAbsolute(cmd) ? cmd : path.resolve(cwd, cmd);
  if (!fs.existsSync(resolvedCmd)) {
    return { error: `Start command not found: ${resolvedCmd}` };
  }

  log.info(
    `Using custom start command: ${resolvedCmd} ${args.join(" ")} (ext=${ext}, cwd=${cwd})`,
  );

  const config = platformSpawnConfig({ resolvedCmd, args, cwd, ext });
  return { config: { env: process.env, ...config } };
}

// Default startup script (StartServer64.bat / start-server.sh) shipped by
// the server install. Ensures the script is executable on Linux and sets
// LD_LIBRARY_PATH so the JVM can find libsteam_api.so and friends.
function buildDefaultScriptConfig({ serverPath, serverBat }) {
  const batPath = path.join(serverPath, serverBat);
  if (!fs.existsSync(batPath)) {
    return { error: `Server startup script not found: ${batPath}` };
  }

  if (isWindows) {
    return {
      config: {
        command: "cmd.exe",
        args: ["/c", serverBat],
        cwd: serverPath,
        env: process.env,
      },
    };
  }

  try {
    fs.chmodSync(batPath, 0o750);
  } catch (e) {
    log.warn(`Could not chmod startup script: ${e.message}`);
  }
  const ldPath = buildLdLibraryPath(path.resolve(serverPath));
  log.debug(
    `Spawning default .sh: bash ${serverBat} (cwd=${serverPath}, LD_LIBRARY_PATH=${ldPath})`,
  );
  return {
    config: {
      command: "bash",
      args: [serverBat],
      cwd: serverPath,
      env: { ...process.env, LD_LIBRARY_PATH: ldPath },
    },
  };
}

/**
 * Build the launch config from ServerManager state. Returns `{ config }` on
 * success or `{ error }` on failure — never throws, so callers can decide
 * how to surface the failure (thrown Error, {success:false}, etc.).
 * @param {object} state - { startCommand, serverPath, serverBat }
 * @returns {{ config: {command: string, args: string[], cwd: string, env: object} } | { error: string }}
 */
export function buildLaunchConfig(state) {
  if (state.startCommand) {
    return buildCustomCommandConfig(state);
  }
  return buildDefaultScriptConfig(state);
}
