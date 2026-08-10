import http from "http";
import fs from "fs";
import { createLogger } from "../utils/logger.js";

const log = createLogger("DockerClient");

const REQUEST_TIMEOUT_MS = 8000;

// Image name patterns for known PZ-in-Docker distributions. Matched against
// the container's Image field (case-insensitive substring match).
const PZ_IMAGE_PATTERNS = [
  /ich777\/steamcmd:projectzomboid/i,
  /afey\/zomboid/i,
  /cyrale\/project-zomboid/i,
];

// Containers can also opt in explicitly via a label, for custom images that
// don't match any known name pattern.
const PZ_ROLE_LABEL = "zomboid-panel.role";
const PZ_ROLE_LABEL_VALUE = "pz-server";

function containerLooksLikePZ(container) {
  const image = String(container.Image || "");
  if (PZ_IMAGE_PATTERNS.some((pattern) => pattern.test(image))) return true;
  const labels = container.Labels || {};
  return labels[PZ_ROLE_LABEL] === PZ_ROLE_LABEL_VALUE;
}

// Docker's non-TTY container log stream multiplexes stdout/stderr with an
// 8-byte header per frame: [streamType, 0, 0, 0, sizeBE(4 bytes)]. Strip the
// headers so callers get plain text. Falls back to the raw buffer if it
// doesn't look like the framed format (e.g. container ran with a TTY).
function demuxLogFrames(buffer) {
  const chunks = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const streamType = buffer[offset];
    if (streamType > 2) break; // not a recognizable frame header
    const size = buffer.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > buffer.length) break;
    chunks.push(buffer.subarray(start, end));
    offset = end;
  }
  if (offset === 0) return buffer.toString("utf-8");
  return Buffer.concat(chunks).toString("utf-8");
}

// Docker's official CPU % formula: usage delta relative to system-wide CPU
// time delta, scaled by core count so multi-core hosts don't cap at 100%.
export function calculateCpuPercent(stats) {
  const cpuStats = stats?.cpu_stats;
  const preCpuStats = stats?.precpu_stats;
  if (!cpuStats || !preCpuStats) return 0;
  const cpuDelta =
    (cpuStats.cpu_usage?.total_usage || 0) - (preCpuStats.cpu_usage?.total_usage || 0);
  const systemDelta = (cpuStats.system_cpu_usage || 0) - (preCpuStats.system_cpu_usage || 0);
  const cpuCount = onlineCpuCount(cpuStats);
  if (systemDelta > 0 && cpuDelta > 0) {
    return (cpuDelta / systemDelta) * cpuCount * 100;
  }
  return 0;
}

function onlineCpuCount(cpuStats) {
  return cpuStats.online_cpus || cpuStats.cpu_usage?.percpu_usage?.length || 1;
}

// blkio_stats.io_service_bytes_recursive is a flat list of per-device
// entries; "op" capitalization varies by kernel/cgroup driver ("Read" vs
// "read"), so compare case-insensitively.
function sumBlkioBytes(blkioStats, op) {
  const entries = blkioStats?.io_service_bytes_recursive || [];
  return entries
    .filter((entry) => entry.op?.toLowerCase() === op)
    .reduce((sum, entry) => sum + (entry.value || 0), 0);
}

// stats.networks is keyed by interface name (eth0, ...) — sum across all of
// them rather than assuming a single interface.
function sumNetworkField(networks, field) {
  return Object.values(networks || {}).reduce((sum, net) => sum + (net[field] || 0), 0);
}

// Turn a raw `/containers/{id}/stats?stream=false` snapshot into the shape
// the frontend and Socket.IO consumers use. Never throws — missing fields
// (stopped container, older API version) just read as zero.
export function parseContainerStats(stats) {
  const memUsage = stats?.memory_stats?.usage || 0;
  const memLimit = stats?.memory_stats?.limit || 0;
  return {
    cpu: {
      usagePercent: Math.round(calculateCpuPercent(stats) * 10) / 10,
      cores: onlineCpuCount(stats?.cpu_stats || {}),
    },
    memory: {
      used: memUsage,
      limit: memLimit,
      usagePercent: memLimit > 0 ? Math.round((memUsage / memLimit) * 1000) / 10 : 0,
    },
    disk: {
      read: sumBlkioBytes(stats?.blkio_stats, "read"),
      write: sumBlkioBytes(stats?.blkio_stats, "write"),
    },
    network: {
      rxBytes: sumNetworkField(stats?.networks, "rx_bytes"),
      txBytes: sumNetworkField(stats?.networks, "tx_bytes"),
    },
  };
}

export class DockerClient {
  constructor(socketPath = "/var/run/docker.sock") {
    this.socketPath = socketPath;
    this.available = false;
    this.init();
  }

  init() {
    try {
      this.available = fs.existsSync(this.socketPath);
    } catch (err) {
      log.debug(`Docker socket check failed: ${err.message}`);
      this.available = false;
    }
    if (!this.available) {
      log.debug(`Docker socket not found at ${this.socketPath} — Docker integration disabled`);
    }
  }

  // Raw HTTP request over the Docker Unix socket. Resolves to
  // { statusCode, body } where body is the raw Buffer — parsing is left to
  // callers since logs and JSON responses need different treatment.
  _request(method, path, body, timeoutMs = REQUEST_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const payload = body ? Buffer.from(JSON.stringify(body)) : null;
      const headers = payload
        ? { "Content-Type": "application/json", "Content-Length": payload.length }
        : {};

      const req = http.request(
        { socketPath: this.socketPath, method, path, headers, timeout: timeoutMs },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks) });
          });
        },
      );

      req.on("timeout", () => req.destroy(new Error("Docker API request timed out")));
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  async _requestJson(method, path, body) {
    if (!this.available) return { success: false, error: "Docker socket unavailable" };
    try {
      const { statusCode, body: raw } = await this._request(method, path, body);
      const text = raw.toString("utf-8").trim();
      const data = text ? JSON.parse(text) : null;
      if (statusCode >= 400) {
        return { success: false, error: data?.message || `Docker API error ${statusCode}`, statusCode };
      }
      return { success: true, data, statusCode };
    } catch (err) {
      log.debug(`Docker API request failed (${method} ${path}): ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async listContainers(filters = {}) {
    if (!this.available) return [];
    const query = new URLSearchParams({ all: "true" });
    if (Object.keys(filters).length > 0) {
      query.set("filters", JSON.stringify(filters));
    }
    const result = await this._requestJson("GET", `/containers/json?${query.toString()}`);
    return result.success && Array.isArray(result.data) ? result.data : [];
  }

  async inspectContainer(id) {
    if (!this.available || !id) return null;
    const result = await this._requestJson("GET", `/containers/${encodeURIComponent(id)}/json`);
    return result.success ? result.data : null;
  }

  async startContainer(id) {
    return this._lifecycleAction(id, "start");
  }

  async stopContainer(id) {
    return this._lifecycleAction(id, "stop");
  }

  async restartContainer(id) {
    return this._lifecycleAction(id, "restart");
  }

  async _lifecycleAction(id, action) {
    if (!id) return { success: false, error: "Container id is required" };
    if (!this.available) return { success: false, error: "Docker socket unavailable" };
    const result = await this._requestJson("POST", `/containers/${encodeURIComponent(id)}/${action}`);
    // Docker returns 204 (no body) on success, 304 if already in that state.
    if (result.statusCode === 304) {
      return { success: true, message: `Container already ${action === "stop" ? "stopped" : "running"}` };
    }
    return result.success
      ? { success: true }
      : { success: false, error: result.error || `Failed to ${action} container` };
  }

  async getContainerLogs(id, tail = 100) {
    if (!id) return { success: false, error: "Container id is required" };
    if (!this.available) return { success: false, error: "Docker socket unavailable" };
    const safeTail = Number.isFinite(Number(tail)) ? Math.max(1, Math.min(Number(tail), 5000)) : 100;
    const query = new URLSearchParams({ stdout: "true", stderr: "true", tail: String(safeTail) });
    try {
      const { statusCode, body } = await this._request("GET", `/containers/${encodeURIComponent(id)}/logs?${query}`);
      if (statusCode >= 400) {
        return { success: false, error: `Docker API error ${statusCode}` };
      }
      const text = demuxLogFrames(body);
      return { success: true, lines: text.split(/\r?\n/).filter((line) => line.length > 0) };
    } catch (err) {
      log.debug(`Container log fetch failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async findPZContainers() {
    const containers = await this.listContainers();
    return containers.filter(containerLooksLikePZ);
  }

  async isContainerRunning(id) {
    const info = await this.inspectContainer(id);
    return Boolean(info?.State?.Running);
  }

  // One-shot resource snapshot (stream=false — a streaming connection would
  // never resolve and would leak a socket per call).
  async getContainerStats(id) {
    if (!id || !this.available) return null;
    const result = await this._requestJson("GET", `/containers/${encodeURIComponent(id)}/stats?stream=false`);
    if (!result.success || !result.data) return null;
    return parseContainerStats(result.data);
  }

  // ── Volume operations ──

  async createVolume(name) {
    if (!this.available) return { success: false, error: "Docker control is unavailable" };
    const result = await this._requestJson("POST", "/volumes/create", { Name: name });
    return result.success ? { success: true, data: result.data } : { success: false, error: result.error };
  }

  async inspectVolume(name) {
    if (!this.available || !name) return null;
    const result = await this._requestJson("GET", `/volumes/${encodeURIComponent(name)}`);
    return result.success ? result.data : null;
  }

  async removeVolume(name) {
    if (!this.available) return { success: false, error: "Docker control is unavailable" };
    if (!name) return { success: false, error: "Volume name is required" };
    const result = await this._requestJson("DELETE", `/volumes/${encodeURIComponent(name)}`);
    return result.success || result.statusCode === 204
      ? { success: true }
      : { success: false, error: result.error || `Delete failed (${result.statusCode})` };
  }

  // ── Container creation/removal ──

  async createContainer(spec, name) {
    if (!this.available) return { success: false, error: "Docker control is unavailable" };
    const query = name ? `?name=${encodeURIComponent(name)}` : "";
    const result = await this._requestJson("POST", `/containers/create${query}`, spec);
    return result.success
      ? { success: true, id: result.data?.Id }
      : { success: false, error: result.error };
  }

  async removeContainer(id, force = false) {
    if (!this.available) return { success: false, error: "Docker control is unavailable" };
    if (!id) return { success: false, error: "Container id is required" };
    const result = await this._requestJson(
      "DELETE", `/containers/${encodeURIComponent(id)}?force=${force}`,
    );
    return result.success || result.statusCode === 204
      ? { success: true }
      : { success: false, error: result.error || `Remove failed (${result.statusCode})` };
  }

  // ── Image operations ──

  async pullImage(imageRef, tag) {
    if (!this.available) return { success: false, error: "Docker control is unavailable" };
    // Parse "image:tag" if tag not provided separately
    let image = imageRef;
    let resolvedTag = tag || "latest";
    if (!tag && imageRef.includes(":")) {
      const lastColon = imageRef.lastIndexOf(":");
      image = imageRef.slice(0, lastColon);
      resolvedTag = imageRef.slice(lastColon + 1);
    }
    const query = `fromImage=${encodeURIComponent(image)}&tag=${encodeURIComponent(resolvedTag)}`;
    try {
      // Image pulls can take minutes — use a 10-minute timeout
      const { statusCode } = await this._request("POST", `/images/create?${query}`, null, 600_000);
      return statusCode < 400 ? { success: true } : { success: false, error: `Pull failed (${statusCode})` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async inspectImage(imageRef) {
    if (!this.available || !imageRef) return null;
    const result = await this._requestJson("GET", `/images/${encodeURIComponent(imageRef)}/json`);
    return result.success ? result.data : null;
  }
}
