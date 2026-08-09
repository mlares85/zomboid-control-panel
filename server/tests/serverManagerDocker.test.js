import { describe, expect, it, vi } from 'vitest';
import { ServerManager } from '../services/serverManager.js';

vi.mock('../database/init.js', () => ({
  logServerEvent: vi.fn(async () => {}),
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => {}),
  getActiveServer: vi.fn(async () => null),
  getServer: vi.fn(async () => null),
  getServers: vi.fn(async () => []),
}));

// In-memory fake standing in for the real Docker socket client — matches
// project convention of fakes over mocks.
class FakeDockerClient {
  constructor({ available = true, running = false } = {}) {
    this.available = available;
    this.running = running;
    this.calls = [];
  }
  async inspectContainer(ref) {
    this.calls.push(['inspectContainer', ref]);
    return { Id: ref, Name: `/${ref}`, State: { Running: this.running } };
  }
  async isContainerRunning(ref) {
    this.calls.push(['isContainerRunning', ref]);
    return this.running;
  }
  async startContainer(ref) {
    this.calls.push(['startContainer', ref]);
    this.running = true;
    return { success: true };
  }
  async stopContainer(ref) {
    this.calls.push(['stopContainer', ref]);
    this.running = false;
    return { success: true };
  }
}

function makeDockerManager({ running = false, containerId = 'pz-container' } = {}) {
  const manager = new ServerManager();
  const dockerClient = new FakeDockerClient({ running });
  manager.setDockerClient(dockerClient);
  Object.assign(manager, {
    configLoaded: true,
    dockerContainerId: containerId,
    serverName: 'DockerServer',
  });
  // Fail loudly if a Docker-backed manager ever falls through to the native
  // pgrep scan — that is exactly the bug this feature fixes.
  manager._scanDedicatedServerProcesses = async () => {
    throw new Error('native process scan should not run for a Docker-backed server');
  };
  return { manager, dockerClient };
}

describe('ServerManager — Docker-backed detection', () => {
  it('reports running via the Docker socket instead of pgrep', async () => {
    const { manager } = makeDockerManager({ running: true });

    const details = await manager.getServerProcessDetails();

    expect(details.running).toBe(true);
    expect(details.scanFailed).toBe(false);
    expect(await manager.checkServerRunning()).toBe(true);
  });

  it('reports not running when the container is stopped', async () => {
    const { manager } = makeDockerManager({ running: false });

    expect(await manager.checkServerRunning()).toBe(false);
  });

  it('does not treat a native server as Docker-backed when no container is configured', async () => {
    const manager = new ServerManager();
    manager.setDockerClient(new FakeDockerClient({ running: true }));
    Object.assign(manager, { configLoaded: true, dockerContainerId: null, dockerContainerName: null });

    expect(manager._isDockerBacked()).toBe(false);
  });
});

describe('ServerManager — Docker-backed start/stop', () => {
  it('refuses to start when the container is already running (no native spawn attempted)', async () => {
    const { manager, dockerClient } = makeDockerManager({ running: true });

    await expect(manager.startServer()).rejects.toThrow('Server is already running');
    expect(dockerClient.calls.some(([name]) => name === 'startContainer')).toBe(false);
    expect(manager.serverProcess).toBeNull();
  });

  it('starts the container when not running, without requiring a native serverPath', async () => {
    const { manager, dockerClient } = makeDockerManager({ running: false });
    expect(manager.serverPath).toBe('');

    const result = await manager.startServer();

    expect(result.success).toBe(true);
    expect(dockerClient.calls).toContainEqual(['startContainer', 'pz-container']);
    expect(manager.isRunning).toBe(true);
    expect(manager.serverProcess).toBeNull();
  });

  it('force-stops by stopping the container directly, not by killing PIDs', async () => {
    const { manager, dockerClient } = makeDockerManager({ running: true });

    const result = await manager.stopServer(false);

    expect(result.success).toBe(true);
    expect(dockerClient.calls).toContainEqual(['stopContainer', 'pz-container']);
    expect(manager.isRunning).toBe(false);
  });
});
