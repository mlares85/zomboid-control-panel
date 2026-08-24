/**
 * DockerBridgeTransport - exec-based PanelBridge IPC for Docker-managed servers
 *
 * The panel can't reach a managed container's filesystem directly, so this
 * transport reads/writes the same bridge queue files (see panelBridge.js)
 * through `docker exec` instead of the filesystem. It mirrors the primitive
 * operations the SFTP transport (panelBridgeSftp.js) performs remotely.
 */
import { createLogger } from '../utils/logger.js';

const log = createLogger('Bridge:DockerExec');

const SEQUENCE_WIDTH = 10;
const RESULT_FILE_PATTERN = /^res-\d+\.json(?:\.txt)?$/;
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_]+$/;
// Deliberately narrow: only characters a legitimate bridge path can contain.
// This is defense-in-depth on top of buildManagedBridgePath — bridgePath may
// also arrive from stored config, not just that helper.
const SAFE_BRIDGE_PATH = /^\/[A-Za-z0-9_\-./]+$/;
const NOT_FOUND_PATTERN = /no such file or directory/i;

// The container's data volume mounts the PZ data dir at /root/Zomboid.
export function buildManagedBridgePath(serverName) {
  if (typeof serverName !== 'string' || !SERVER_NAME_PATTERN.test(serverName)) {
    throw new Error('Server name must contain only letters, numbers, and underscores');
  }
  return `/root/Zomboid/Lua/panelbridge/${serverName}`;
}

function safeBridgePath(bridgePath) {
  if (typeof bridgePath !== 'string' || bridgePath.includes('..') || !SAFE_BRIDGE_PATH.test(bridgePath)) {
    return { ok: false, error: 'Invalid bridge path' };
  }
  return { ok: true, value: bridgePath.replace(/\/+$/, '') };
}

function safeResultFilename(filename) {
  if (typeof filename !== 'string' || !RESULT_FILE_PATTERN.test(filename)) {
    return { ok: false, error: 'Invalid result filename' };
  }
  return { ok: true, value: filename };
}

function formatSeq(seq) {
  return String(seq).padStart(SEQUENCE_WIDTH, '0');
}

// Docker exec has no way to pipe stdin (see DockerClient.exec), so commands
// are embedded as shell arguments instead. Wrapping in single quotes and
// escaping `'` as `'\''` is the standard POSIX-safe way to inline arbitrary
// content — this survives newlines, double quotes, and backslashes untouched.
function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function isNotFound(result) {
  return NOT_FOUND_PATTERN.test(result.stdout || '') || NOT_FOUND_PATTERN.test(result.error || '');
}

function parseJson(text, label) {
  try {
    return { success: true, value: JSON.parse(text) };
  } catch (err) {
    return { success: false, error: `Invalid JSON in ${label} file: ${err.message}` };
  }
}

export function createDockerBridgeTransport(dockerClient) {
  async function readStatus(containerId, bridgePath) {
    const path = safeBridgePath(bridgePath);
    if (!path.ok) return { success: false, error: path.error };
    const result = await dockerClient.exec(containerId, ['cat', `${path.value}/status.json.txt`]);
    if (!result.success) return catFailure(result, 'Status');
    const parsed = parseJson(result.stdout, 'status');
    return parsed.success ? { success: true, status: parsed.value } : parsed;
  }

  async function writeCommand(containerId, bridgePath, seq, payload) {
    const path = safeBridgePath(bridgePath);
    if (!path.ok) return { success: false, error: path.error };
    if (!Number.isInteger(Number(seq)) || Number(seq) < 1) {
      return { success: false, error: 'Invalid sequence number' };
    }
    const fileName = `cmd-${formatSeq(seq)}.json`;
    const script = buildWriteScript(path.value, fileName, payload);
    const result = await dockerClient.exec(containerId, ['sh', '-c', script]);
    if (!result.success) {
      log.debug(`writeCommand failed for ${containerId}: ${result.error}`);
      return { success: false, error: result.error || 'Failed to write command' };
    }
    return { success: true, fileName };
  }

  async function listResults(containerId, bridgePath) {
    const path = safeBridgePath(bridgePath);
    if (!path.ok) return { success: false, error: path.error };
    const result = await dockerClient.exec(containerId, ['ls', '-1', `${path.value}/outbox/`]);
    if (!result.success) {
      if (isNotFound(result)) return { success: true, files: [] };
      log.debug(`listResults failed for ${containerId}: ${result.error}`);
      return { success: false, error: result.error || 'Failed to list results' };
    }
    const files = result.stdout.split('\n').map((line) => line.trim()).filter((name) => RESULT_FILE_PATTERN.test(name)).sort();
    return { success: true, files };
  }

  async function readResult(containerId, bridgePath, filename) {
    const path = safeBridgePath(bridgePath);
    if (!path.ok) return { success: false, error: path.error };
    const file = safeResultFilename(filename);
    if (!file.ok) return { success: false, error: file.error };
    const result = await dockerClient.exec(containerId, ['cat', `${path.value}/outbox/${file.value}`]);
    if (!result.success) return catFailure(result, 'Result');
    const parsed = parseJson(result.stdout, 'result');
    return parsed.success ? { success: true, result: parsed.value } : parsed;
  }

  async function deleteResult(containerId, bridgePath, filename) {
    const path = safeBridgePath(bridgePath);
    if (!path.ok) return { success: false, error: path.error };
    const file = safeResultFilename(filename);
    if (!file.ok) return { success: false, error: file.error };
    const result = await dockerClient.exec(containerId, ['rm', '-f', `${path.value}/outbox/${file.value}`]);
    if (!result.success) {
      log.debug(`deleteResult failed for ${containerId}: ${result.error}`);
      return { success: false, error: result.error || 'Failed to delete result' };
    }
    return { success: true };
  }

  return { readStatus, writeCommand, listResults, readResult, deleteResult };
}

function buildWriteScript(bridgePath, fileName, payload) {
  const inboxDir = `${bridgePath}/inbox`;
  const json = JSON.stringify(payload);
  const filePath = `${inboxDir}/${fileName}`;
  return `mkdir -p ${shellSingleQuote(inboxDir)} && printf '%s' ${shellSingleQuote(json)} > ${shellSingleQuote(filePath)}`;
}

function catFailure(result, label) {
  if (isNotFound(result)) return { success: false, error: `${label} file not found`, notFound: true };
  log.debug(`${label} read failed: ${result.error}`);
  return { success: false, error: result.error || `Failed to read ${label.toLowerCase()} file` };
}
