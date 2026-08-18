/**
 * PanelBridge Auto-Install
 *
 * When the panel has local filesystem access to the PZ server's install
 * directory (bind mount, same-host install), PanelBridge.lua can be copied
 * into place automatically instead of requiring the user to do it by hand.
 * Remote/SFTP-managed servers are never touched here — the panel has no
 * local path to write to for those.
 *
 * Every function degrades to a clear `{ success: false, error }` rather than
 * throwing: install failures must never block server activation (see the
 * best-effort call in routes/servers.js POST /:id/activate).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { compareModVersions } from '../utils/embeddedLua.js';
import { createLogger } from '../utils/logger.js';
import { LocalFiles } from './fileAccess/index.js';

const log = createLogger('PanelBridgeInstaller');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VERSION_REGEX = /VERSION\s*=\s*"([^"]+)"/;

// Mirrors the candidate lookup used by the /install-mod-auto and
// /auto-configure routes (dev checkout vs. packaged pkg binary layouts).
function sourceCandidates() {
  return [
    path.join(process.cwd(), 'pz-mod', 'PanelBridge', 'media', 'lua', 'server', 'PanelBridge.lua'),
    path.join(path.dirname(process.execPath), 'pz-mod', 'PanelBridge', 'media', 'lua', 'server', 'PanelBridge.lua'),
    path.join(__dirname, '..', '..', 'pz-mod', 'PanelBridge', 'media', 'lua', 'server', 'PanelBridge.lua'),
  ];
}

export async function resolveSourcePath({ fileAccess } = {}) {
  const fa = fileAccess || new LocalFiles();
  for (const candidate of sourceCandidates()) {
    if (await fa.exists(candidate)) return candidate;
  }
  return null;
}

// The server's install directory, resolved the same way serverManager does:
// prefer serverPath, fall back to installPath, and if that names a launch
// script (.bat/.sh/.exe) rather than a directory, use its parent folder.
function resolveInstallDir(server) {
  let dir = server?.serverPath || server?.installPath;
  if (!dir) return null;
  const lower = dir.toLowerCase();
  if (lower.endsWith('.bat') || lower.endsWith('.sh') || lower.endsWith('.exe')) {
    dir = path.dirname(dir);
  }
  return dir;
}

export function resolveTargetPath(server) {
  const installDir = resolveInstallDir(server);
  return installDir ? path.join(installDir, 'media', 'lua', 'server', 'PanelBridge.lua') : null;
}

export async function canAutoInstall(server, { fileAccess } = {}) {
  if (!server || server.isRemote) return false;
  const fa = fileAccess || new LocalFiles();
  const installDir = resolveInstallDir(server);
  if (!installDir || !await fa.exists(installDir) || !await fa.access(installDir, 'write')) {
    return false;
  }
  return Boolean(await resolveSourcePath({ fileAccess: fa }));
}

async function readVersion(filePath, fa) {
  const read = await fa.readFile(filePath, 'utf8');
  if (!read.success) {
    log.debug(`Could not read version from ${filePath}: ${read.error}`);
    return null;
  }
  return (read.data.match(VERSION_REGEX) || [])[1] || null;
}

export async function checkBridgeInstalled(server, { fileAccess } = {}) {
  const fa = fileAccess || new LocalFiles();
  const sourcePath = await resolveSourcePath({ fileAccess: fa });
  const targetPath = resolveTargetPath(server);
  const installed = Boolean(targetPath && await fa.exists(targetPath));
  const sourceVersion = sourcePath ? await readVersion(sourcePath, fa) : null;
  const targetVersion = installed ? await readVersion(targetPath, fa) : null;
  const needsUpdate = Boolean(
    installed && sourceVersion && targetVersion &&
    compareModVersions(sourceVersion, targetVersion) > 0,
  );

  return { installed, version: targetVersion, needsUpdate, sourcePath, targetPath };
}

// Best-effort: match the copied file's ownership to the install directory's
// so a game server process running as a different, unprivileged user can
// still read it. chown requires elevated privileges on most systems and
// doesn't exist at all on Windows, so failures here are logged, not thrown.
// Not part of the FileAccess interface (no uid/gid in its stat() shape, no
// remote equivalent) — uses raw fs directly, same as fs.watch elsewhere.
function matchOwnership(targetPath, referencePath) {
  if (process.platform === 'win32' || !referencePath) return;
  try {
    const { uid, gid } = fs.statSync(referencePath);
    fs.chownSync(targetPath, uid, gid);
  } catch (error) {
    log.debug(`Could not match ownership for ${targetPath}: ${error.message}`);
  }
}

export async function installBridge(server, { fileAccess } = {}) {
  const fa = fileAccess || new LocalFiles();
  const sourcePath = await resolveSourcePath({ fileAccess: fa });
  const targetPath = resolveTargetPath(server);
  if (!sourcePath) {
    return { success: false, error: 'PanelBridge source not found in panel install.' };
  }
  if (!targetPath) {
    return { success: false, error: 'Server install path not configured.' };
  }

  const mkdirResult = await fa.mkdir(path.dirname(targetPath));
  if (!mkdirResult.success) {
    log.warn(`PanelBridge install failed: ${mkdirResult.error}`);
    return { success: false, error: mkdirResult.error };
  }
  const copyResult = await fa.copyFile(sourcePath, targetPath);
  if (!copyResult.success) {
    log.warn(`PanelBridge install failed: ${copyResult.error}`);
    return { success: false, error: copyResult.error };
  }
  matchOwnership(targetPath, resolveInstallDir(server));
  const version = await readVersion(targetPath, fa);
  log.info(`PanelBridge installed at ${targetPath} (v${version || 'unknown'})`);
  return { success: true, targetPath, version };
}
