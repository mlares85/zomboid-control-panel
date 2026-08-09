import { describe, expect, it } from 'vitest';
import {
  isWindowsDedicatedServerCommandLine,
  resolveServerProvider,
  scoreServerProcessOwnership,
  ServerManager,
} from '../services/serverManager.js';

describe('ServerManager Windows detection', () => {
  it('should recognize WinGSM-style ProjectZomboid server launches', () => {
    const commandLine = '"C:\\WinGSM\\servers\\1\\serverfiles\\ProjectZomboid64.exe" -cachedir="C:\\WinGSM\\servers\\1\\Zomboid" -servername WheelerZoidB42';

    expect(isWindowsDedicatedServerCommandLine(commandLine)).toBe(true);
  });

  it('should recognize Java dedicated server launches', () => {
    const commandLine = '"C:\\serverfiles\\jre64\\bin\\java.exe" -cp %PZ_CLASSPATH% zombie.network.GameServer -servername WheelerZoidB42';

    expect(isWindowsDedicatedServerCommandLine(commandLine)).toBe(true);
  });

  it('should ignore plain client launches without dedicated-server markers', () => {
    const commandLine = '"C:\\Games\\ProjectZomboid\\ProjectZomboid64.exe"';

    expect(isWindowsDedicatedServerCommandLine(commandLine)).toBe(false);
  });
});

describe('ServerManager process ownership', () => {
  const serverA = {
    serverName: 'ServerA',
    savePath: 'C:\\Zomboid\\A',
    serverPath: 'C:\\pz\\a',
  };

  it('claims a process launched with its own -servername', () => {
    const commandLine =
      '"C:\\pz\\a\\jre64\\bin\\java.exe" -cp pz.jar zombie.network.GameServer -servername "ServerA" -cachedir="C:\\Zomboid\\A"';

    expect(scoreServerProcessOwnership(commandLine, serverA)).toBeGreaterThan(0);
  });

  it('disowns a process launched with a different -servername', () => {
    const commandLine =
      '"C:\\pz\\b\\jre64\\bin\\java.exe" -cp pz.jar zombie.network.GameServer -servername "ServerB" -cachedir="C:\\Zomboid\\B"';

    expect(scoreServerProcessOwnership(commandLine, serverA)).toBe(-1);
  });

  it('disowns a process whose -cachedir points at another save folder', () => {
    const commandLine =
      'java zombie.network.GameServer -servername ServerA -cachedir="C:\\Zomboid\\B"';

    expect(scoreServerProcessOwnership(commandLine, serverA)).toBe(-1);
  });

  it('claims a process by install path when no -servername is present', () => {
    const commandLine =
      '"C:\\pz\\a\\jre64\\bin\\java.exe" -cp pz.jar zombie.network.GameServer';

    expect(scoreServerProcessOwnership(commandLine, serverA)).toBeGreaterThan(0);
  });

  it('leaves an unidentifiable stock launch unattributed', () => {
    const commandLine =
      '.\\jre64\\bin\\java.exe -Djava.library.path=natives/ -cp java/. zombie.network.GameServer';

    expect(scoreServerProcessOwnership(commandLine, serverA)).toBe(0);
  });
});

describe('ServerManager detection with two servers on one host', () => {
  // Only Server A is running.
  const running = [
    {
      pid: '111',
      cmd: 'java zombie.network.GameServer -servername "ServerA" -cachedir="C:\\Zomboid\\A"',
    },
  ];

  const makeManager = (config) => {
    const manager = new ServerManager();
    Object.assign(manager, config, { configLoaded: true });
    manager._scanDedicatedServerProcesses = async () => ({
      running: running.length > 0,
      matched: running,
    });
    return manager;
  };

  it('does not report Server B as running while only Server A is up', async () => {
    const serverB = makeManager({
      serverName: 'ServerB',
      savePath: 'C:\\Zomboid\\B',
      serverPath: 'C:\\pz\\b',
    });

    expect(await serverB.checkServerRunning()).toBe(false);
  });

  it('reports Server A as running and owning only its own PID', async () => {
    const serverA = makeManager({
      serverName: 'ServerA',
      savePath: 'C:\\Zomboid\\A',
      serverPath: 'C:\\pz\\a',
    });

    const details = await serverA.getServerProcessDetails();
    expect(details.running).toBe(true);
    expect(details.owned.map((entry) => entry.pid)).toEqual(['111']);
  });
});

describe('resolveServerProvider', () => {
  it('defaults to native when nothing marks the server otherwise', () => {
    expect(resolveServerProvider({})).toBe('native');
    expect(resolveServerProvider(null)).toBe('native');
  });

  it('treats isRemote servers as remote-sftp', () => {
    expect(resolveServerProvider({ isRemote: true })).toBe('remote-sftp');
  });

  it('prefers an explicit provider field over isRemote', () => {
    expect(
      resolveServerProvider({ isRemote: true, provider: 'docker-managed' }),
    ).toBe('docker-managed');
  });
});

describe('ServerManager provider guard on startServer', () => {
  it('refuses to spawn a native process for a non-native provider', async () => {
    const manager = new ServerManager();
    Object.assign(manager, {
      configLoaded: true,
      provider: 'docker-managed',
      serverPath: 'C:\\pz\\a',
    });

    const result = await manager.startServer();

    expect(result).toEqual({
      success: false,
      error:
        'Server runs in Docker container — start it from Docker or mount the Docker socket',
      fixUrl: '/servers',
    });
  });

  it('does not block a native provider from reaching the normal start path', async () => {
    const manager = new ServerManager();
    Object.assign(manager, {
      configLoaded: true,
      provider: 'native',
      serverPath: '',
      startCommand: '',
    });

    // Native provider clears the guard and falls through to the existing
    // "no path configured" failure, proving the guard didn't swallow it.
    await expect(manager.startServer()).rejects.toThrow(
      'Server path not configured',
    );
  });
});
