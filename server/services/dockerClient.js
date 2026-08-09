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
  _request(method, path, body) {
    return new Promise((resolve, reject) => {
      const payload = body ? Buffer.from(JSON.stringify(body)) : null;
      const headers = payload
        ? { "Content-Type": "application/json", "Content-Length": payload.length }
        : {};

      const req = http.request(
        { socketPath: this.socketPath, method, path, headers, timeout: REQUEST_TIMEOUT_MS },
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
}
