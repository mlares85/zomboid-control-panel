import path from "path";
import { getSetting, getActiveServer } from "../../database/init.js";

// Resolves the active server's config directory (where <serverName>.ini lives),
// falling back through legacy single-server settings for installs that
// haven't been migrated to multi-server yet.
export async function getServerConfigPath() {
  const activeServer = await getActiveServer();

  // First, use explicitly configured serverConfigPath if available
  if (activeServer?.serverConfigPath) {
    return activeServer.serverConfigPath;
  }

  // Fallback to zomboidDataPath + Server (like serverFiles.js does)
  if (activeServer?.zomboidDataPath) {
    return path.join(activeServer.zomboidDataPath, "Server");
  }

  // Fallback to legacy settings
  const legacyPath = await getSetting("serverConfigPath");
  if (legacyPath) return legacyPath;

  const legacyZomboidPath = await getSetting("zomboidDataPath");
  if (legacyZomboidPath) {
    return path.join(legacyZomboidPath, "Server");
  }

  return null;
}

export async function getServerName() {
  const activeServer = await getActiveServer();
  if (activeServer?.serverName) {
    return activeServer.serverName;
  }
  const legacyName = await getSetting("serverName");
  return legacyName || "servertest";
}

export async function getServerPath() {
  const activeServer = await getActiveServer();
  if (activeServer?.installPath) {
    return activeServer.installPath;
  }
  const legacyPath = await getSetting("serverPath");
  return legacyPath || null;
}

// Builds the sanitized <serverConfigPath>/<serverName>.ini path, or null when
// serverName looks like a path traversal attempt.
export function getSanitizedIniPath(serverConfigPath, serverName) {
  if (!serverConfigPath || typeof serverName !== "string") {
    return null;
  }

  const sanitizedServerName = path.basename(serverName);
  if (
    !sanitizedServerName ||
    sanitizedServerName !== serverName ||
    serverName.includes("..")
  ) {
    return null;
  }

  return path.join(serverConfigPath, `${sanitizedServerName}.ini`);
}
