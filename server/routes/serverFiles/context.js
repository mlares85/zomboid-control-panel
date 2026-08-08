import fs from "fs";
import path from "path";
import os from "os";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Files");
import { getActiveServer, getAllSettings } from "../../database/init.js";
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
  if (activeServer?.serverName) {
    return activeServer.serverName;
  }

  const settings = await getAllSettings();
  return settings.serverName || "servertest";
}

// Backup directory
export async function getBackupPath() {
  return path.join(await getServerConfigPath(), "backups");
}

// Create backup before saving
export async function createBackup(filename) {
  const configPath = await getServerConfigPath();
  const backupDir = await getBackupPath();
  const filePath = path.join(configPath, filename);

  try {
    // Check file existence asynchronously
    try {
      await fs.promises.access(filePath);
    } catch (e) {
      log.debug(`Config backup source not found: ${filePath} — ${e.message}`);
      return null;
    }

    // Ensure backup directory exists
    await fs.promises.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `${filename}.${timestamp}.bak`;
    const backupPath = path.join(backupDir, backupName);

    // Async copy
    await fs.promises.copyFile(filePath, backupPath);
    log.info(`Created backup: ${backupName}`);

    // Cleanup old backups asynchronously
    const files = await fs.promises.readdir(backupDir);
    const backups = files
      .filter((f) => f.startsWith(filename + ".") && f.endsWith(".bak"))
      .sort()
      .reverse();

    if (backups.length > 10) {
      const filesToDelete = backups.slice(10);
      await Promise.all(
        filesToDelete.map((old) =>
          fs.promises
            .unlink(path.join(backupDir, old))
            .catch((e) =>
              log.warn(`Failed to delete old backup ${old}: ${e.message}`),
            ),
        ),
      );
    }

    return backupName;
  } catch (error) {
    log.error(`Backup creation failed: ${error.message}`);
    return null;
  }
}
