// Cross-cutting helpers shared by the server/ route sub-modules.
// Extracted verbatim from the former monolithic server/routes/server.js.
import path from "path";
import fs from "fs";

export const isWindows = process.platform === "win32";

// Security: Validate path is safe (no traversal, absolute path)
export function isValidPath(inputPath) {
  if (!inputPath || typeof inputPath !== "string") return false;
  const normalized = path.normalize(inputPath);
  // Check for path traversal attempts
  if (normalized.includes("..")) return false;
  // Must be absolute path
  if (!path.isAbsolute(normalized)) return false;
  return true;
}

// Security: Validate server name (alphanumeric, underscore, hyphen, space allowed)
// Spaces are permitted mid-name to match PZ server names like "The Gang Goes To Louisville".
// Leading/trailing spaces are trimmed before validation.
export function isValidServerName(name) {
  if (!name || typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 64) return false;
  // Must start and end with alphanumeric/underscore/hyphen; spaces allowed in the middle.
  return /^[a-zA-Z0-9_-][a-zA-Z0-9_\- ]*[a-zA-Z0-9_-]$|^[a-zA-Z0-9_-]$/.test(
    trimmed,
  );
}

// Security: Sanitize string for use in batch files/commands
export function sanitizeForBatch(str) {
  if (!str) return "";
  // Remove or escape dangerous characters for batch files
  return String(str)
    .replace(/[&|<>^%"`;$(){}[\]!]/g, "") // Remove shell metacharacters
    .replace(/\.\./g, "") // Remove path traversal
    .trim();
}

// Security: Validate integer in range
export function validateInt(value, min, max, defaultVal) {
  const num = parseInt(value, 10);
  if (isNaN(num) || num < min || num > max) return defaultVal;
  return num;
}

export function resolveZomboidPaths(installPath, zomboidDataPath) {
  const defaultZomboidDataPath =
    process.env.PZ_SAVE_PATH || `${installPath}_Data`;
  const zomboidPath = zomboidDataPath || defaultZomboidDataPath;

  return {
    zomboidPath,
    serverConfigPath: path.join(zomboidPath, "Server"),
    usesEnvironmentDataPath:
      !zomboidDataPath && Boolean(process.env.PZ_SAVE_PATH),
  };
}

export function ensureWritableDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
  fs.accessSync(directoryPath, fs.constants.W_OK);
}

export function formatWritablePathError(label, directoryPath) {
  const isContainer =
    !isWindows &&
    (fs.existsSync("/.dockerenv") || fs.existsSync("/run/.containerenv"));
  const baseMessage = `${label} is not writable: ${directoryPath}.`;

  if (isContainer) {
    return (
      `${baseMessage} In Docker, bind-mount a writable host folder at this path ` +
      `and make it owned by the panel container UID/GID.`
    );
  }

  return `${baseMessage} Choose a folder writable by the panel process.`;
}

// Runs ensureWritableDirectory() and converts a failure into the standard
// formatWritablePathError() message. `reportPath` lets callers check one
// directory (e.g. the Server/ subfolder) while reporting the error against a
// different, more meaningful path (e.g. the parent data folder) — matching
// the original inline behavior in /install and /quick-setup.
export function checkWritableOrError(checkPath, label, reportPath = checkPath) {
  try {
    ensureWritableDirectory(checkPath);
    return null;
  } catch {
    return formatWritablePathError(label, reportPath);
  }
}
