import { createLogger } from "../utils/logger.js";
import { getActiveServer } from "../database/init.js";

const log = createLogger("ContainerStatsPoller");

export const POLL_INTERVAL_MS = 5000;

/**
 * Resolve the Docker container ref (id or name) for the active server, or
 * null if the active server isn't Docker-backed. Reads straight from the DB
 * record rather than through ServerManager so this poller has no dependency
 * on it (constructor-injected dockerClient is the only collaborator).
 */
export async function resolveActiveContainerRef() {
  const activeServer = await getActiveServer();
  if (!activeServer) return null;
  return activeServer.dockerContainerId || activeServer.dockerContainerName || null;
}

/**
 * Polls the active server's container stats on an interval and broadcasts
 * them over Socket.IO. Each tick re-resolves the active server (same
 * pattern as DiskMonitor), so it naturally goes quiet when the active
 * server isn't Docker-backed and resumes as soon as a Docker-backed server
 * is activated — no explicit start/stop wiring needed on activation.
 */
export class ContainerStatsPoller {
  constructor(io, dockerClient, { intervalMs = POLL_INTERVAL_MS, resolveRef = resolveActiveContainerRef } = {}) {
    this.io = io;
    this.dockerClient = dockerClient;
    this.intervalMs = intervalMs;
    this.resolveRef = resolveRef;
    this.timer = null;
    this.lastStats = null;
  }

  async checkNow() {
    if (!this.dockerClient?.available) return null;
    const containerId = await this.resolveRef();
    if (!containerId) {
      this.lastStats = null;
      return null;
    }
    const stats = await this.dockerClient.getContainerStats(containerId);
    this.lastStats = stats ? { containerId, ...stats } : null;
    if (this.lastStats) this.io?.emit("container:stats", this.lastStats);
    return this.lastStats;
  }

  getLastStats() {
    return this.lastStats;
  }

  start() {
    if (this.timer) return;
    this.checkNow().catch((err) => log.debug(`Initial stats check failed: ${err.message}`));
    this.timer = setInterval(() => {
      this.checkNow().catch((err) => log.debug(`Stats check failed: ${err.message}`));
    }, this.intervalMs);
    if (this.timer.unref) this.timer.unref();
    log.info(`started (polling every ${this.intervalMs / 1000}s)`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
