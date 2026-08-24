import { describe, it, expect } from 'vitest';
import { Parser } from 'tar';
import { installBridgeToContainer } from '../services/dockerBridgeInstaller.js';
import { resolveSourcePath } from '../services/panelBridgeInstaller.js';
import fs from 'fs';

// Parses a single-file tar buffer back into { path, content } so tests can
// assert on what was actually packed, not just that putArchive was called.
function readSingleTarEntry(buffer) {
  return new Promise((resolve, reject) => {
    let entryPath;
    let content = '';
    const parser = new Parser();
    parser.on('entry', (entry) => {
      entryPath = entry.path;
      entry.on('data', (chunk) => {
        content += chunk.toString('utf8');
      });
    });
    parser.on('end', () => resolve({ path: entryPath, content }));
    parser.on('error', reject);
    parser.end(buffer);
  });
}

function fakeDockerClient(putArchiveImpl) {
  return { putArchive: putArchiveImpl };
}

describe('installBridgeToContainer', () => {
  it('uploads a tar containing media/lua/server/PanelBridge.lua to the target dir', async () => {
    let received;
    const dockerClient = fakeDockerClient(async (containerId, targetDir, tarBuffer) => {
      received = { containerId, targetDir, tarBuffer };
      return { success: true };
    });

    const result = await installBridgeToContainer(dockerClient, 'c1', '/opt/pz-server');

    expect(result).toEqual({ success: true });
    expect(received.containerId).toBe('c1');
    expect(received.targetDir).toBe('/opt/pz-server');

    const entry = await readSingleTarEntry(received.tarBuffer);
    expect(entry.path).toBe('media/lua/server/PanelBridge.lua');
    const sourceContent = fs.readFileSync(await resolveSourcePath(), 'utf8');
    expect(entry.content).toBe(sourceContent);
  });

  it('fails cleanly when containerId is missing', async () => {
    const dockerClient = fakeDockerClient(async () => ({ success: true }));

    const result = await installBridgeToContainer(dockerClient, null, '/opt/pz-server');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/container id/i);
  });

  it('fails cleanly when targetDir is missing', async () => {
    const dockerClient = fakeDockerClient(async () => ({ success: true }));

    const result = await installBridgeToContainer(dockerClient, 'c1', null);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/target directory/i);
  });

  it('fails cleanly when the PanelBridge source cannot be resolved', async () => {
    const dockerClient = fakeDockerClient(async () => ({ success: true }));
    const missingFileAccess = { exists: async () => false };

    const result = await installBridgeToContainer(dockerClient, 'c1', '/opt/pz-server', {
      fileAccess: missingFileAccess,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/source not found/i);
  });

  it('propagates a putArchive failure instead of throwing', async () => {
    const dockerClient = fakeDockerClient(async () => ({
      success: false,
      error: 'Docker API error 500',
    }));

    const result = await installBridgeToContainer(dockerClient, 'c1', '/opt/pz-server');

    expect(result).toEqual({ success: false, error: 'Docker API error 500' });
  });
});
