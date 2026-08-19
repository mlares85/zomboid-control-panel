import path from "path";
import os from "os";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Files");
import { getActiveServer, getAllSettings } from "../../database/init.js";
import { LocalFiles } from "../../services/fileAccess/index.js";
import {
  SFTP_CONFIG_PATH_KEY,
  getMirrorPath,
  isRemoteConfigConfigured,
  validateRemoteConfigTransport,
} from "../../services/remoteConfigFiles.js";

// Shared path/name/backup helpers used across every serverFiles sub-route.

export async function resolveRemoteConfigTransport() {
  const settings = await getAllSettings();
  if (!isRemoteConfigConfigured(settings)) return null;
  return validateRemoteConfigTransport({
    host: settings.panelBridgeSftpHost,
    port: settings.panelBridgeSftpPort,
    username: settings.panelBridgeSftpUsername,
    password: settings.panelBridgeSftpPassword,
    configPath: settings[SFTP_CONFIG_PATH_KEY],
  });
}

// Get the server config directory path
export async function getServerConfigPath() {
  const activeServer = await getActiveServer();

  // A remote server's Server/ folder lives on the host; the handlers below
  // work against its local SFTP mirror instead.
  if (activeServer?.isRemote) {
    const transport = await resolveRemoteConfigTransport();
    if (transport) {
      return getMirrorPath(transport, await getServerName());
    }
  }

  // First, use explicitly configured serverConfigPath if available
  if (activeServer?.serverConfigPath) {
    return activeServer.serverConfigPath;
  }

  // Fallback to zomboidDataPath + Server
  if (activeServer?.zomboidDataPath) {
    return path.join(activeServer.zomboidDataPath, "Server");
  }

  // Fallback to legacy settings
  const settings = await getAllSettings();
  if (settings.serverConfigPath) {
    return settings.serverConfigPath;
  }
  if (settings.zomboidDataPath) {
    return path.join(settings.zomboidDataPath, "Server");
  }

  // Default path: ~/Zomboid/Server
  return path.join(os.homedir(), "Zomboid", "Server");
}

// Get server name from active server
export async function getServerName() {
  const activeServer = await getActiveServer();
  let raw;
  if (activeServer?.serverName) {
    raw = activeServer.serverName;
  } else {
    const settings = await getAllSettings();
    raw = settings.serverName || "servertest";
  }

  const safe = path.basename(raw);
  if (safe !== raw || !safe) {
    throw new Error("Configured server name contains invalid path characters");
  }
  return safe;
}

// Backup directory
export async function getBackupPath() {
  return path.join(await getServerConfigPath(), "backups");
}

// Create backup before saving
export async function createBackup(filename) {
  const fileAccess = new LocalFiles();
  const configPath = await getServerConfigPath();
  const backupDir = await getBackupPath();
  const filePath = path.join(configPath, filename);

  try {
    // Check file existence asynchronously
    const sourceExists = await fileAccess.exists(filePath);
    if (!sourceExists) {
      log.debug(`Config backup source not found: ${filePath}`);
      return null;
    }

    // Ensure backup directory exists
    await fileAccess.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `${filename}.${timestamp}.bak`;
    const backupPath = path.join(backupDir, backupName);

    // Async copy
    const copyResult = await fileAccess.copyFile(filePath, backupPath);
    if (!copyResult.success) {
      log.error(`Backup creation failed: ${copyResult.error}`);
      return null;
    }
    log.info(`Created backup: ${backupName}`);

    // Cleanup old backups asynchronously
    const files = await fileAccess.readdir(backupDir);
    const backups = files
      .filter((f) => f.startsWith(filename + ".") && f.endsWith(".bak"))
      .sort()
      .reverse();

    if (backups.length > 10) {
      const filesToDelete = backups.slice(10);
      await Promise.all(
        filesToDelete.map(async (old) => {
          const result = await fileAccess.unlink(path.join(backupDir, old));
          if (!result.success) {
            log.warn(`Failed to delete old backup ${old}: ${result.error}`);
          }
        }),
      );
    }

    return backupName;
  } catch (error) {
    log.error(`Backup creation failed: ${error.message}`);
    return null;
  }
}
