/**
 * Docker exec-based bridge sync transport.
 *
 * Same role as PanelBridgeSftpTransport: periodically syncs the bridge IPC
 * files between a local cache directory and the managed container via
 * DockerClient.exec(). The main PanelBridge polling loop then reads/writes
 * the local cache as usual — no code changes needed in panelBridge.js
 * beyond calling configureDocker() instead of configureSftp().
 */

import fs from "fs";
import path from "path";
import { createDockerBridgeTransport, buildManagedBridgePath } from "./dockerBridgeTransport.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Bridge:DockerSync");
const SYNC_INTERVAL_MS = 3000;

export class DockerBridgeSyncTransport {
  constructor(dockerClient) {
    this.dockerClient = dockerClient;
    this.transport = createDockerBridgeTransport(dockerClient);
    this.containerId = null;
    this.bridgePath = null;
    this.cachePath = null;
    this.timer = null;
    this.running = false;
    this.syncing = false;
    this.lastSyncAt = null;
    this.lastError = null;
    this.lastLatencyMs = null;
  }

  async start(containerId, serverName, cachePath) {
    this.containerId = containerId;
    this.bridgePath = buildManagedBridgePath(serverName);
    this.cachePath = cachePath;
    fs.mkdirSync(path.join(cachePath, "inbox"), { recursive: true });
    fs.mkdirSync(path.join(cachePath, "outbox"), { recursive: true });
    this.running = true;
    await this.syncNow(true);
    this.timer = setInterval(() => this.syncNow().catch(() => {}), SYNC_INTERVAL_MS);
    this.timer.unref?.();
  }

  async stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async syncStatus() {
    const result = await this.transport.readStatus(this.containerId, this.bridgePath);
    if (!result.success) return;
    const localPath = path.join(this.cachePath, "status.json.txt");
    fs.writeFileSync(localPath, JSON.stringify(result.status));
  }

  async syncOutbox() {
    const listResult = await this.transport.listResults(this.containerId, this.bridgePath);
    if (!listResult.success || !listResult.files.length) return;
    for (const file of listResult.files) {
      const localPath = path.join(this.cachePath, "outbox", file);
      if (fs.existsSync(localPath)) continue;
      const readResult = await this.transport.readResult(this.containerId, this.bridgePath, file);
      if (readResult.success) {
        fs.writeFileSync(localPath, JSON.stringify(readResult.data));
      }
    }
  }

  async uploadInbox() {
    const inbox = path.join(this.cachePath, "inbox");
    if (!fs.existsSync(inbox)) return;
    const names = fs.readdirSync(inbox).filter((n) => /^cmd-\d+\.json$/.test(n)).sort();
    for (const name of names) {
      const content = JSON.parse(fs.readFileSync(path.join(inbox, name), "utf-8"));
      const seq = parseInt(name.match(/cmd-(\d+)\.json/)?.[1] || "0", 10);
      const result = await this.transport.writeCommand(this.containerId, this.bridgePath, seq, content);
      if (result.success) {
        fs.unlinkSync(path.join(inbox, name));
      }
    }
  }

  async syncNow(throwOnError = false) {
    if (!this.running || this.syncing) return;
    this.syncing = true;
    const startedAt = Date.now();
    try {
      await this.uploadInbox();
      await this.syncStatus();
      await this.syncOutbox();
      this.lastSyncAt = Date.now();
      this.lastLatencyMs = this.lastSyncAt - startedAt;
      this.lastError = null;
    } catch (error) {
      this.lastError = error.message;
      log.debug(`Docker bridge sync failed: ${error.message}`);
      if (throwOnError) throw error;
    } finally {
      this.syncing = false;
    }
  }

  getStatus() {
    return {
      type: "docker",
      running: this.running,
      containerId: this.containerId,
      cachePath: this.cachePath,
      lastSyncAt: this.lastSyncAt,
      lastLatencyMs: this.lastLatencyMs,
      lastError: this.lastError,
    };
  }
}
