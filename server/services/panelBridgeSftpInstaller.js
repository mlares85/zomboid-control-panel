/**
 * Installs PanelBridge.lua onto a remote (provider `remote-sftp`) PZ server
 * over SFTP. The panel has no local filesystem access to those hosts, so
 * unlike panelBridgeInstaller.js's local copy this uploads the mod bytes
 * directly instead of writing through a FileAccess abstraction.
 */

import SftpClient from 'ssh2-sftp-client';
import { resolveSourcePath } from './panelBridgeInstaller.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Bridge:SftpInstaller');

function remoteLuaDir(installPath) {
  return `${String(installPath).replace(/\/+$/, '')}/media/lua/server`;
}

export async function installBridgeViaSftp(sftpConfig, installPath) {
  const sourcePath = await resolveSourcePath();
  if (!sourcePath) {
    return { success: false, error: 'PanelBridge source not found in panel install.' };
  }

  const client = new SftpClient('PanelBridgeSftpInstaller');
  try {
    await client.connect({
      host: sftpConfig.host,
      port: sftpConfig.port,
      username: sftpConfig.username,
      password: sftpConfig.password,
      readyTimeout: 10000,
    });

    const remoteDir = remoteLuaDir(installPath);
    const remotePath = `${remoteDir}/PanelBridge.lua`;
    await client.mkdir(remoteDir, true);
    await client.fastPut(sourcePath, remotePath);

    log.info(`PanelBridge installed via SFTP at ${remotePath}`);
    return { success: true, remotePath };
  } catch (error) {
    log.warn(`SFTP bridge install failed: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    await client.end().catch(() => {});
  }
}
