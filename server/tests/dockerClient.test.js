import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { DockerClient } from '../services/dockerClient.js';

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
    await startMockServer((req, res) => res.writeHead(204).end());
    const client = new DockerClient(socketPath);

    const result = await client.stopContainer('c1');

    expect(result).toEqual({ success: true });
    expect(requests[0]).toEqual({ method: 'POST', url: '/containers/c1/stop' });
  });

  it('restarts a container via POST /containers/{id}/restart', async () => {
    await startMockServer((req, res) => res.writeHead(204).end());
    const client = new DockerClient(socketPath);

    const result = await client.restartContainer('c1');

    expect(result).toEqual({ success: true });
    expect(requests[0]).toEqual({ method: 'POST', url: '/containers/c1/restart' });
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
});
