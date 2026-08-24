import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { DockerClient, calculateCpuPercent, parseContainerStats } from '../services/dockerClient.js';

// Encode a docker log frame: [streamType, 0, 0, 0, sizeBE(4 bytes)] + payload.
function frameLogLine(text, streamType = 1) {
  const payload = Buffer.from(`${text}\n`, 'utf-8');
  const header = Buffer.alloc(8);
  header.writeUInt8(streamType, 0);
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

describe('DockerClient — socket unavailable', () => {
  it('gracefully degrades when the socket does not exist', async () => {
    const client = new DockerClient('/nonexistent/docker-test.sock');
    expect(client.available).toBe(false);
    expect(await client.listContainers()).toEqual([]);
    expect(await client.findPZContainers()).toEqual([]);
    expect(await client.inspectContainer('abc')).toBeNull();
    expect(await client.isContainerRunning('abc')).toBe(false);
  });

  it('returns a failure result instead of throwing for lifecycle actions', async () => {
    const client = new DockerClient('/nonexistent/docker-test.sock');
    const result = await client.startContainer('abc');
    expect(result).toEqual({ success: false, error: 'Docker socket unavailable' });
  });

  it('requires a container id for lifecycle actions', async () => {
    const client = new DockerClient('/nonexistent/docker-test.sock');
    const result = await client.stopContainer();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/id is required/);
  });
});

describe('DockerClient — against a mock Docker API over a Unix socket', () => {
  let socketPath;
  let server;
  let requests;

  beforeEach(() => {
    socketPath = path.join(os.tmpdir(), `docker-test-${randomUUID()}.sock`);
    requests = [];
  });

  afterEach(async () => {
    await new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
  });

  function startMockServer(handler) {
    return new Promise((resolve) => {
      server = http.createServer((req, res) => {
        requests.push({ method: req.method, url: req.url });
        handler(req, res);
      });
      server.listen(socketPath, resolve);
    });
  }

  it('reports available once the socket exists', async () => {
    await startMockServer((req, res) => res.end());
    const client = new DockerClient(socketPath);
    expect(client.available).toBe(true);
  });

  it('lists containers with the expected request path', async () => {
    const containers = [{ Id: 'c1', Names: ['/pz'], Image: 'ich777/steamcmd:projectzomboid' }];
    await startMockServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(containers));
    });
    const client = new DockerClient(socketPath);

    const result = await client.listContainers();

    expect(result).toEqual(containers);
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toMatch(/^\/containers\/json\?all=true/);
  });

  it('filters PZ containers by known image name patterns and by role label', async () => {
    const containers = [
      { Id: 'c1', Names: ['/pz1'], Image: 'ich777/steamcmd:projectzomboid' },
      { Id: 'c2', Names: ['/pz2'], Image: 'afey/zomboid:latest' },
      { Id: 'c3', Names: ['/pz3'], Image: 'cyrale/project-zomboid:stable' },
      { Id: 'c4', Names: ['/custom'], Image: 'myorg/custom-image', Labels: { 'zomboid-panel.role': 'pz-server' } },
      { Id: 'c5', Names: ['/unrelated'], Image: 'nginx:latest' },
    ];
    await startMockServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(containers));
    });
    const client = new DockerClient(socketPath);

    const matched = await client.findPZContainers();

    expect(matched.map((c) => c.Id).sort()).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('inspects a container and parses running state', async () => {
    await startMockServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ Id: 'c1', Name: '/pz', State: { Running: true } }));
    });
    const client = new DockerClient(socketPath);

    expect(await client.isContainerRunning('c1')).toBe(true);
    expect(requests[0].url).toBe('/containers/c1/json');
  });

  it('reports not running when container State.Running is false', async () => {
    await startMockServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ Id: 'c1', State: { Running: false } }));
    });
    const client = new DockerClient(socketPath);

    expect(await client.isContainerRunning('c1')).toBe(false);
  });

  it('starts a container via POST /containers/{id}/start', async () => {
    await startMockServer((req, res) => res.writeHead(204).end());
    const client = new DockerClient(socketPath);

    const result = await client.startContainer('c1');

    expect(result).toEqual({ success: true });
    expect(requests[0]).toEqual({ method: 'POST', url: '/containers/c1/start' });
  });

  it('stops a container via POST /containers/{id}/stop', async () => {
    await startMockServer((req, res) => {
      if (req.method === 'GET' && req.url === '/containers/c1/json') {
        // inspectContainer to read StopTimeout
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ Config: { StopTimeout: 10 } }));
      } else {
        res.writeHead(204).end();
      }
    });
    const client = new DockerClient(socketPath);

    const result = await client.stopContainer('c1');

    expect(result).toEqual({ success: true });
    expect(requests[0]).toEqual({ method: 'GET', url: '/containers/c1/json' });
    expect(requests[1]).toEqual({ method: 'POST', url: '/containers/c1/stop' });
  });

  it('restarts a container via POST /containers/{id}/restart', async () => {
    await startMockServer((req, res) => {
      if (req.method === 'GET' && req.url === '/containers/c1/json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ Config: { StopTimeout: 10 } }));
      } else {
        res.writeHead(204).end();
      }
    });
    const client = new DockerClient(socketPath);

    const result = await client.restartContainer('c1');

    expect(result).toEqual({ success: true });
    expect(requests[0]).toEqual({ method: 'GET', url: '/containers/c1/json' });
    expect(requests[1]).toEqual({ method: 'POST', url: '/containers/c1/restart' });
  });

  it('treats a 304 (already in that state) as success', async () => {
    await startMockServer((req, res) => res.writeHead(304).end());
    const client = new DockerClient(socketPath);

    const result = await client.startContainer('c1');

    expect(result.success).toBe(true);
  });

  it('surfaces the Docker error message on a failed lifecycle action', async () => {
    await startMockServer((req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'container is paused' }));
    });
    const client = new DockerClient(socketPath);

    const result = await client.stopContainer('c1');

    expect(result).toEqual({ success: false, error: 'container is paused' });
  });

  it('fetches and demultiplexes container logs, honoring tail', async () => {
    await startMockServer((req, res) => {
      res.writeHead(200);
      res.end(Buffer.concat([frameLogLine('Server started'), frameLogLine('Player joined')]));
    });
    const client = new DockerClient(socketPath);

    const result = await client.getContainerLogs('c1', 50);

    expect(result.success).toBe(true);
    expect(result.lines).toEqual(['Server started', 'Player joined']);
    expect(requests[0].url).toMatch(/^\/containers\/c1\/logs\?/);
    expect(requests[0].url).toContain('tail=50');
  });

  it('defaults tail to 100 when not a valid number', async () => {
    await startMockServer((req, res) => res.writeHead(200).end());
    const client = new DockerClient(socketPath);

    await client.getContainerLogs('c1', 'not-a-number');

    expect(requests[0].url).toContain('tail=100');
  });

  it('fetches and parses container stats with stream=false', async () => {
    await startMockServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(rawStatsFixture()));
    });
    const client = new DockerClient(socketPath);

    const stats = await client.getContainerStats('c1');

    expect(requests[0]).toEqual({ method: 'GET', url: '/containers/c1/stats?stream=false' });
    expect(stats).toEqual({
      cpu: { usagePercent: 20, cores: 2 },
      memory: { used: 536870912, limit: 2147483648, usagePercent: 25 },
      disk: { read: 1536, write: 2048 },
      network: { rxBytes: 1500, txBytes: 2700 },
    });
  });

  it('returns null for stats when the Docker API errors', async () => {
    await startMockServer((req, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'no such container' }));
    });
    const client = new DockerClient(socketPath);

    expect(await client.getContainerStats('missing')).toBeNull();
  });
});

describe('DockerClient — getArchive', () => {
  let socketPath;
  let server;

  beforeEach(() => {
    socketPath = path.join(os.tmpdir(), `docker-test-${randomUUID()}.sock`);
  });

  afterEach(async () => {
    await new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
  });

  function startMockServer(handler) {
    return new Promise((resolve) => {
      server = http.createServer(handler);
      server.listen(socketPath, resolve);
    });
  }

  it('streams a tar archive to the destination file', async () => {
    const tarContent = Buffer.from('fake-tar-content');
    await startMockServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/x-tar' });
      res.end(tarContent);
    });
    const client = new DockerClient(socketPath);
    const dest = path.join(os.tmpdir(), `archive-test-${randomUUID()}.tar`);

    try {
      const result = await client.getArchive('c1', '/root/Zomboid/Saves', dest);

      expect(result.success).toBe(true);
      expect(result.size).toBe(tarContent.length);
      expect(fs.existsSync(dest)).toBe(true);
      expect(fs.readFileSync(dest).toString()).toBe('fake-tar-content');
    } finally {
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
    }
  });

  it('gzips when compress:true', async () => {
    const tarContent = Buffer.from('fake-tar-content-to-compress');
    await startMockServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/x-tar' });
      res.end(tarContent);
    });
    const client = new DockerClient(socketPath);
    const dest = path.join(os.tmpdir(), `archive-test-${randomUUID()}.tar.gz`);

    try {
      const result = await client.getArchive('c1', '/data', dest, { compress: true });

      expect(result.success).toBe(true);
      expect(result.size).toBeGreaterThan(0);
      // Gzip magic bytes: 1f 8b
      const header = fs.readFileSync(dest).subarray(0, 2);
      expect(header[0]).toBe(0x1f);
      expect(header[1]).toBe(0x8b);
    } finally {
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
    }
  });

  it('returns failure when the container path does not exist (404)', async () => {
    await startMockServer((req, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'no such container' }));
    });
    const client = new DockerClient(socketPath);
    const dest = path.join(os.tmpdir(), `archive-test-${randomUUID()}.tar`);

    const result = await client.getArchive('c1', '/no/such/path', dest);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no such container/);
  });

  it('returns failure when the socket is unavailable', async () => {
    const client = new DockerClient('/nonexistent/docker-test.sock');
    const result = await client.getArchive('c1', '/data', '/tmp/nope.tar');

    expect(result).toEqual({ success: false, error: 'Docker socket unavailable' });
  });

  it('returns failure when container id is missing', async () => {
    await startMockServer((req, res) => res.end());
    const client = new DockerClient(socketPath);

    const result = await client.getArchive(null, '/data', '/tmp/nope.tar');

    expect(result).toEqual({ success: false, error: 'Container id is required' });
  });
});

describe('DockerClient — putArchive', () => {
  let socketPath;
  let server;

  beforeEach(() => {
    socketPath = path.join(os.tmpdir(), `docker-test-${randomUUID()}.sock`);
  });

  afterEach(async () => {
    await new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
  });

  function startMockServer(handler) {
    return new Promise((resolve) => {
      server = http.createServer(handler);
      server.listen(socketPath, resolve);
    });
  }

  it('uploads a tar buffer to the container at the given path', async () => {
    let receivedBody = null;
    let receivedContentType = null;
    await startMockServer((req, res) => {
      receivedContentType = req.headers['content-type'];
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        receivedBody = Buffer.concat(chunks);
        res.writeHead(200).end();
      });
    });
    const client = new DockerClient(socketPath);
    const tarContent = Buffer.from('fake-tar-bytes');

    const result = await client.putArchive('c1', '/opt/pz-server', tarContent);

    expect(result.success).toBe(true);
    expect(receivedContentType).toBe('application/x-tar');
    expect(receivedBody.toString()).toBe('fake-tar-bytes');
  });

  it('returns failure on 404', async () => {
    await startMockServer((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'no such container' }));
    });
    const client = new DockerClient(socketPath);

    const result = await client.putArchive('c1', '/opt', Buffer.alloc(0));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no such container/);
  });
});

describe('DockerClient — exec', () => {
  let socketPath;
  let server;

  beforeEach(() => {
    socketPath = path.join(os.tmpdir(), `docker-test-${randomUUID()}.sock`);
  });

  afterEach(async () => {
    await new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
  });

  function startMockServer(handler) {
    return new Promise((resolve) => {
      server = http.createServer(handler);
      server.listen(socketPath, resolve);
    });
  }

  it('creates an exec instance, starts it, and returns stdout', async () => {
    const execId = 'exec-abc123';
    await startMockServer((req, res) => {
      if (req.method === 'POST' && req.url.includes('/exec') && !req.url.includes('start') && !req.url.includes('json')) {
        // Create exec
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ Id: execId }));
      } else if (req.url.includes('/start')) {
        // Start exec — return multiplexed stdout
        res.writeHead(200);
        res.end(frameLogLine('hello world'));
      } else if (req.url.includes('/json')) {
        // Inspect exec
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ExitCode: 0 }));
      } else {
        res.writeHead(404).end();
      }
    });
    const client = new DockerClient(socketPath);

    const result = await client.exec('c1', 'echo hello world');

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello world');
  });

  it('returns failure when the command exits non-zero', async () => {
    const execId = 'exec-fail';
    await startMockServer((req, res) => {
      if (req.method === 'POST' && req.url.includes('/exec') && !req.url.includes('start') && !req.url.includes('json')) {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ Id: execId }));
      } else if (req.url.includes('/start')) {
        res.writeHead(200);
        res.end(frameLogLine('file not found'));
      } else if (req.url.includes('/json')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ExitCode: 1 }));
      } else {
        res.writeHead(404).end();
      }
    });
    const client = new DockerClient(socketPath);

    const result = await client.exec('c1', 'cat /nonexistent');

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it('returns failure when socket is unavailable', async () => {
    const client = new DockerClient('/nonexistent/docker-test.sock');
    const result = await client.exec('c1', 'echo hi');
    expect(result).toEqual({ success: false, error: 'Docker socket unavailable' });
  });
});

describe('DockerClient — getContainerStats guard clauses', () => {
  it('returns null without a container id', async () => {
    const client = new DockerClient('/nonexistent/docker-test.sock');
    expect(await client.getContainerStats()).toBeNull();
  });

  it('returns null when the socket is unavailable', async () => {
    const client = new DockerClient('/nonexistent/docker-test.sock');
    expect(await client.getContainerStats('c1')).toBeNull();
  });
});

// Realistic single-snapshot payload from GET /containers/{id}/stats?stream=false.
function rawStatsFixture() {
  return {
    cpu_stats: {
      cpu_usage: { total_usage: 2_000_000_000, percpu_usage: [1_000_000_000, 1_000_000_000] },
      system_cpu_usage: 20_000_000_000,
      online_cpus: 2,
    },
    precpu_stats: {
      cpu_usage: { total_usage: 1_000_000_000 },
      system_cpu_usage: 10_000_000_000,
    },
    memory_stats: { usage: 512 * 1024 * 1024, limit: 2 * 1024 * 1024 * 1024 },
    blkio_stats: {
      io_service_bytes_recursive: [
        { major: 8, minor: 0, op: 'Read', value: 1024 },
        { major: 8, minor: 0, op: 'Write', value: 2048 },
        { major: 8, minor: 0, op: 'read', value: 512 },
      ],
    },
    networks: {
      eth0: { rx_bytes: 1000, tx_bytes: 2000 },
      eth1: { rx_bytes: 500, tx_bytes: 700 },
    },
  };
}

describe('calculateCpuPercent', () => {
  it('applies Docker’s CPU% formula scaled by core count', () => {
    expect(calculateCpuPercent(rawStatsFixture())).toBe(20);
  });

  it('returns 0 when cpu_stats/precpu_stats are missing', () => {
    expect(calculateCpuPercent({})).toBe(0);
    expect(calculateCpuPercent(null)).toBe(0);
  });

  it('returns 0 when the system delta is zero or negative (stats read too close together)', () => {
    const stats = rawStatsFixture();
    stats.cpu_stats.system_cpu_usage = stats.precpu_stats.system_cpu_usage;
    expect(calculateCpuPercent(stats)).toBe(0);
  });

  it('falls back to percpu_usage length when online_cpus is absent', () => {
    const stats = rawStatsFixture();
    delete stats.cpu_stats.online_cpus;
    expect(calculateCpuPercent(stats)).toBe(20);
  });
});

describe('parseContainerStats', () => {
  it('parses a full snapshot into the clean stats shape', () => {
    expect(parseContainerStats(rawStatsFixture())).toEqual({
      cpu: { usagePercent: 20, cores: 2 },
      memory: { used: 536870912, limit: 2147483648, usagePercent: 25 },
      disk: { read: 1536, write: 2048 },
      network: { rxBytes: 1500, txBytes: 2700 },
    });
  });

  it('reads zeros for every field when given an empty snapshot', () => {
    expect(parseContainerStats({})).toEqual({
      cpu: { usagePercent: 0, cores: 1 },
      memory: { used: 0, limit: 0, usagePercent: 0 },
      disk: { read: 0, write: 0 },
      network: { rxBytes: 0, txBytes: 0 },
    });
  });
});
