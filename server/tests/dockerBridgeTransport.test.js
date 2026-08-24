import { describe, expect, it } from 'vitest';
import {
  createDockerBridgeTransport,
  buildManagedBridgePath,
} from '../services/dockerBridgeTransport.js';

const BRIDGE_PATH = '/root/Zomboid/Lua/panelbridge/myserver';

// Mirrors the shell-quoting the transport uses when it embeds arbitrary
// content inside single quotes: a literal `'` becomes `'\''`.
function extractSingleQuoted(str, startIdx) {
  let i = startIdx + 1;
  let out = '';
  while (i < str.length) {
    if (str[i] === "'") {
      if (str.slice(i, i + 4) === "'\\''") {
        out += "'";
        i += 4;
        continue;
      }
      return { value: out, end: i + 1 };
    }
    out += str[i];
    i++;
  }
  throw new Error('Unterminated quote in fake shell parser');
}

function parseWriteScript(script) {
  let pos = 0;
  const expect = (literal) => {
    if (script.slice(pos, pos + literal.length) !== literal) {
      throw new Error(`Fake shell parser expected "${literal}" at ${pos} in: ${script}`);
    }
    pos += literal.length;
  };
  const quoted = () => {
    const { value, end } = extractSingleQuoted(script, pos);
    pos = end;
    return value;
  };
  expect('mkdir -p ');
  const dir = quoted();
  expect(" && printf '%s' ");
  const json = quoted();
  expect(' > ');
  const filePath = quoted();
  return { dir, json, filePath };
}

// A minimal fake standing in for the container's filesystem, driven purely
// through the same `cmd` shapes DockerClient.exec() would receive. This is
// the in-memory fake CLAUDE.md asks for in place of mocking DockerClient.
function createFakeDockerClient() {
  const files = new Map();
  const knownDirs = new Set();
  const calls = [];
  let running = true;

  function dirOf(filePath) {
    return filePath.slice(0, filePath.lastIndexOf('/'));
  }

  async function exec(containerId, cmd) {
    calls.push({ containerId, cmd });
    if (!running) {
      return { success: false, exitCode: -1, stdout: '', error: 'Docker API error 409' };
    }
    const [bin] = cmd;
    if (bin === 'cat') return execCat(cmd[1]);
    if (bin === 'ls') return execLs(cmd[cmd.length - 1]);
    if (bin === 'rm') return execRm(cmd[cmd.length - 1]);
    if (bin === 'sh' && cmd[1] === '-c') return execSh(cmd[2]);
    return { success: false, exitCode: 127, stdout: '', error: 'unknown command' };
  }

  function execCat(filePath) {
    if (!files.has(filePath)) {
      return { success: false, exitCode: 1, stdout: '', error: `cat: ${filePath}: No such file or directory` };
    }
    return { success: true, exitCode: 0, stdout: files.get(filePath), error: null };
  }

  function execLs(dirArg) {
    const dir = dirArg.replace(/\/$/, '');
    if (!knownDirs.has(dir)) {
      return { success: false, exitCode: 2, stdout: '', error: `ls: ${dir}: No such file or directory` };
    }
    const names = [...files.keys()]
      .filter((p) => dirOf(p) === dir)
      .map((p) => p.slice(dir.length + 1))
      .sort();
    return { success: true, exitCode: 0, stdout: names.length ? `${names.join('\n')}\n` : '', error: null };
  }

  function execRm(filePath) {
    files.delete(filePath);
    return { success: true, exitCode: 0, stdout: '', error: null };
  }

  function execSh(script) {
    const { dir, json, filePath } = parseWriteScript(script);
    knownDirs.add(dir);
    files.set(filePath, json);
    return { success: true, exitCode: 0, stdout: '', error: null };
  }

  return {
    exec,
    calls,
    setRunning: (value) => { running = value; },
    seedFile(filePath, content) {
      files.set(filePath, content);
      knownDirs.add(dirOf(filePath));
    },
    seedDir(dir) { knownDirs.add(dir); },
    hasFile: (filePath) => files.has(filePath),
  };
}

describe('buildManagedBridgePath', () => {
  it('builds the fixed panelbridge path for a server name', () => {
    expect(buildManagedBridgePath('myserver')).toBe('/root/Zomboid/Lua/panelbridge/myserver');
  });

  it('rejects server names with shell metacharacters', () => {
    expect(() => buildManagedBridgePath("myserver; rm -rf /")).toThrow();
    expect(() => buildManagedBridgePath('my server')).toThrow();
    expect(() => buildManagedBridgePath('../etc')).toThrow();
  });
});

describe('DockerBridgeTransport.readStatus', () => {
  it('reads and parses the status file', async () => {
    const docker = createFakeDockerClient();
    docker.seedFile(`${BRIDGE_PATH}/status.json.txt`, JSON.stringify({ alive: true, players: 3 }));
    const transport = createDockerBridgeTransport(docker);

    const result = await transport.readStatus('container1', BRIDGE_PATH);

    expect(result).toEqual({ success: true, status: { alive: true, players: 3 } });
    expect(docker.calls[0].cmd).toEqual(['cat', `${BRIDGE_PATH}/status.json.txt`]);
  });

  it('reports failure when the status file does not exist yet', async () => {
    const docker = createFakeDockerClient();
    const transport = createDockerBridgeTransport(docker);

    const result = await transport.readStatus('container1', BRIDGE_PATH);

    expect(result.success).toBe(false);
    expect(result.notFound).toBe(true);
  });

  it('reports failure with malformed JSON instead of throwing', async () => {
    const docker = createFakeDockerClient();
    docker.seedFile(`${BRIDGE_PATH}/status.json.txt`, '{not json');
    const transport = createDockerBridgeTransport(docker);

    const result = await transport.readStatus('container1', BRIDGE_PATH);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/json/i);
  });

  it('surfaces exec failure when the container is stopped', async () => {
    const docker = createFakeDockerClient();
    docker.setRunning(false);
    const transport = createDockerBridgeTransport(docker);

    const result = await transport.readStatus('container1', BRIDGE_PATH);

    expect(result.success).toBe(false);
    expect(result.notFound).toBeFalsy();
  });

  it('rejects an unsafe bridge path without touching docker', async () => {
    const docker = createFakeDockerClient();
    const transport = createDockerBridgeTransport(docker);

    const result = await transport.readStatus('container1', '/root/Zomboid; rm -rf /');

    expect(result.success).toBe(false);
    expect(docker.calls).toHaveLength(0);
  });
});

describe('DockerBridgeTransport.writeCommand', () => {
  it('writes a command file with a zero-padded sequence number', async () => {
    const docker = createFakeDockerClient();
    const transport = createDockerBridgeTransport(docker);
    const payload = { action: 'players', args: [] };

    const result = await transport.writeCommand('container1', BRIDGE_PATH, 7, payload);

    expect(result).toEqual({ success: true, fileName: 'cmd-0000000007.json' });
    expect(docker.hasFile(`${BRIDGE_PATH}/inbox/cmd-0000000007.json`)).toBe(true);
  });

  it('round-trips JSON payloads containing single quotes and unicode', async () => {
    const docker = createFakeDockerClient();
    const transport = createDockerBridgeTransport(docker);
    const payload = { action: 'say', message: "it's a test — ☃" };

    await transport.writeCommand('container1', BRIDGE_PATH, 1, payload);

    const written = docker.calls.find((c) => c.cmd[0] === 'sh');
    const { json } = parseWriteScript(written.cmd[2]);
    expect(JSON.parse(json)).toEqual(payload);
  });

  it('rejects an invalid sequence number', async () => {
    const docker = createFakeDockerClient();
    const transport = createDockerBridgeTransport(docker);

    const result = await transport.writeCommand('container1', BRIDGE_PATH, -1, {});

    expect(result.success).toBe(false);
    expect(docker.calls).toHaveLength(0);
  });

  it('reports failure when the container is stopped', async () => {
    const docker = createFakeDockerClient();
    docker.setRunning(false);
    const transport = createDockerBridgeTransport(docker);

    const result = await transport.writeCommand('container1', BRIDGE_PATH, 1, { action: 'x' });

    expect(result.success).toBe(false);
  });
});

describe('DockerBridgeTransport.listResults', () => {
  it('lists only result files, sorted', async () => {
    const docker = createFakeDockerClient();
    docker.seedFile(`${BRIDGE_PATH}/outbox/res-0000000002.json.txt`, '{}');
    docker.seedFile(`${BRIDGE_PATH}/outbox/res-0000000001.json.txt`, '{}');
    docker.seedFile(`${BRIDGE_PATH}/outbox/junk.txt`, 'ignore me');
    const transport = createDockerBridgeTransport(docker);

    const result = await transport.listResults('container1', BRIDGE_PATH);

    expect(result).toEqual({
      success: true,
      files: ['res-0000000001.json.txt', 'res-0000000002.json.txt'],
    });
  });

  it('returns an empty list (not an error) when the outbox directory does not exist yet', async () => {
    const docker = createFakeDockerClient();
    const transport = createDockerBridgeTransport(docker);

    const result = await transport.listResults('container1', BRIDGE_PATH);

    expect(result).toEqual({ success: true, files: [] });
  });

  it('reports failure when the container is stopped', async () => {
    const docker = createFakeDockerClient();
    docker.setRunning(false);
    const transport = createDockerBridgeTransport(docker);

    const result = await transport.listResults('container1', BRIDGE_PATH);

    expect(result.success).toBe(false);
  });
});

describe('DockerBridgeTransport.readResult', () => {
  it('reads and parses a result file', async () => {
    const docker = createFakeDockerClient();
    docker.seedFile(`${BRIDGE_PATH}/outbox/res-0000000001.json.txt`, JSON.stringify({ ok: true }));
    const transport = createDockerBridgeTransport(docker);

    const result = await transport.readResult('container1', BRIDGE_PATH, 'res-0000000001.json.txt');

    expect(result).toEqual({ success: true, result: { ok: true } });
  });

  it('rejects a path-traversal filename without touching docker', async () => {
    const docker = createFakeDockerClient();
    const transport = createDockerBridgeTransport(docker);

    const result = await transport.readResult('container1', BRIDGE_PATH, '../../etc/passwd');

    expect(result.success).toBe(false);
    expect(docker.calls).toHaveLength(0);
  });

  it('reports not found for a missing result file', async () => {
    const docker = createFakeDockerClient();
    const transport = createDockerBridgeTransport(docker);

    const result = await transport.readResult('container1', BRIDGE_PATH, 'res-0000000009.json.txt');

    expect(result.success).toBe(false);
    expect(result.notFound).toBe(true);
  });
});

describe('DockerBridgeTransport.deleteResult', () => {
  it('deletes a result file', async () => {
    const docker = createFakeDockerClient();
    docker.seedFile(`${BRIDGE_PATH}/outbox/res-0000000001.json.txt`, '{}');
    const transport = createDockerBridgeTransport(docker);

    const result = await transport.deleteResult('container1', BRIDGE_PATH, 'res-0000000001.json.txt');

    expect(result).toEqual({ success: true });
    expect(docker.hasFile(`${BRIDGE_PATH}/outbox/res-0000000001.json.txt`)).toBe(false);
  });

  it('rejects an invalid filename without touching docker', async () => {
    const docker = createFakeDockerClient();
    const transport = createDockerBridgeTransport(docker);

    const result = await transport.deleteResult('container1', BRIDGE_PATH, 'not-a-result-file');

    expect(result.success).toBe(false);
    expect(docker.calls).toHaveLength(0);
  });

  it('reports failure when the container is stopped', async () => {
    const docker = createFakeDockerClient();
    docker.setRunning(false);
    const transport = createDockerBridgeTransport(docker);

    const result = await transport.deleteResult('container1', BRIDGE_PATH, 'res-0000000001.json.txt');

    expect(result.success).toBe(false);
  });
});
