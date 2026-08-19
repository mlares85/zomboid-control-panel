import { describe, expect, it } from 'vitest';
import {
  extractLaunchArgValue,
  isWindowsDedicatedServerCommandLine,
  normalizePathForCompare,
  scanDedicatedServerProcesses,
  scoreServerProcessOwnership,
} from '../services/processDetection.js';

describe('isWindowsDedicatedServerCommandLine', () => {
  it('recognizes WinGSM-style ProjectZomboid server launches', () => {
    const commandLine =
      '"C:\\WinGSM\\servers\\1\\serverfiles\\ProjectZomboid64.exe" -cachedir="C:\\WinGSM\\servers\\1\\Zomboid" -servername WheelerZoidB42';

    expect(isWindowsDedicatedServerCommandLine(commandLine)).toBe(true);
  });

  it('recognizes Java dedicated server launches', () => {
    const commandLine =
      '"C:\\serverfiles\\jre64\\bin\\java.exe" -cp %PZ_CLASSPATH% zombie.network.GameServer -servername WheelerZoidB42';

    expect(isWindowsDedicatedServerCommandLine(commandLine)).toBe(true);
  });

  it('ignores plain client launches without dedicated-server markers', () => {
    const commandLine = '"C:\\Games\\ProjectZomboid\\ProjectZomboid64.exe"';

    expect(isWindowsDedicatedServerCommandLine(commandLine)).toBe(false);
  });

  it('ignores non-string / empty input', () => {
    expect(isWindowsDedicatedServerCommandLine(undefined)).toBe(false);
    expect(isWindowsDedicatedServerCommandLine('')).toBe(false);
    expect(isWindowsDedicatedServerCommandLine(null)).toBe(false);
  });
});

describe('extractLaunchArgValue', () => {
  it('extracts a space-separated flag value', () => {
    expect(
      extractLaunchArgValue('java -servername WheelerZoidB42', 'servername'),
    ).toBe('WheelerZoidB42');
  });

  it('extracts a quoted, equals-separated flag value', () => {
    expect(
      extractLaunchArgValue(
        'java -cachedir="C:\\Zomboid\\A" -servername A',
        'cachedir',
      ),
    ).toBe('C:\\Zomboid\\A');
  });

  it('returns null when the flag is absent', () => {
    expect(extractLaunchArgValue('java -cp foo.jar', 'servername')).toBeNull();
  });
});

describe('normalizePathForCompare', () => {
  it('collapses slash direction and trailing slashes', () => {
    expect(normalizePathForCompare('C:\\Zomboid\\A\\')).toBe(
      normalizePathForCompare('C:/Zomboid/A'),
    );
  });

  it('strips surrounding quotes', () => {
    expect(normalizePathForCompare('"C:\\Zomboid\\A"')).toBe(
      normalizePathForCompare('C:\\Zomboid\\A'),
    );
  });
});

describe('scoreServerProcessOwnership', () => {
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

  it('returns 0 for an empty command line', () => {
    expect(scoreServerProcessOwnership('', serverA)).toBe(0);
  });
});

describe('scanDedicatedServerProcesses', () => {
  it('resolves with the {running, matched} shape on this host', async () => {
    const result = await scanDedicatedServerProcesses({
      serverName: 'some-nonexistent-test-server',
    });

    expect(typeof result.running).toBe('boolean');
    expect(Array.isArray(result.matched)).toBe(true);
  });
});
