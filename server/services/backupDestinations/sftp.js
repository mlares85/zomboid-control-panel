import SftpClient from "ssh2-sftp-client";
import { BackupDestination } from "./base.js";

// Same validation shape as panelBridgeSftp.js's validateSftpBridgeConfig,
// duplicated (not imported) because that one hard-requires an absolute
// `bridgePath` field name and throws on missing password — backup
// destinations use `path` and tolerate key-based auth being added later.
export function validateSftpDestinationConfig(config) {
  const host = typeof config?.host === "string" ? config.host.trim() : "";
  const username = typeof config?.username === "string" ? config.username.trim() : "";
  const port = Number(config?.port || 22);
  if (!host || host.length > 253 || /[\s/\\]/.test(host)) {
    throw new Error("A valid SFTP host is required");
  }
  if (!username || username.length > 128 || /[\r\n]/.test(username)) {
    throw new Error("A valid SFTP username is required");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SFTP port must be between 1 and 65535");
  }
  const remoteDir = typeof config?.path === "string" ? config.path.trim() : "";
  if (!remoteDir) throw new Error("A remote destination path is required");
  return {
    host,
    port,
    username,
    password: typeof config?.password === "string" ? config.password : "",
    path: remoteDir.replace(/\/+$/, "") || "/",
  };
}

function remotePath(baseDir, name) {
  const safe = String(name).replace(/\\/g, "/").split("/").pop();
  return `${baseDir}/${safe}`;
}

export class SftpDestination extends BackupDestination {
  constructor(config = {}) {
    super(config);
  }

  async withClient(handler) {
    const validated = validateSftpDestinationConfig(this.config);
    const client = new SftpClient("BackupDestinationSftp");
    try {
      await client.connect({
        host: validated.host,
        port: validated.port,
        username: validated.username,
        password: validated.password,
        readyTimeout: 10000,
      });
      return await handler(client, validated);
    } finally {
      await client.end().catch(() => {});
    }
  }

  async upload(filePath, remoteName) {
    return this.withClient(async (client, config) => {
      await client.mkdir(config.path, true);
      const target = remotePath(config.path, remoteName);
      await client.fastPut(filePath, target);
      return { success: true, remotePath: target };
    });
  }

  async list() {
    return this.withClient(async (client, config) => {
      const exists = await client.exists(config.path);
      if (!exists) return [];
      const entries = await client.list(config.path);
      return entries
        .filter((entry) => entry.type === "-")
        .map((entry) => ({
          name: entry.name,
          size: entry.size,
          modified: entry.modifyTime ? new Date(entry.modifyTime).toISOString() : null,
        }));
    });
  }

  async download(remoteName, localPath) {
    return this.withClient(async (client, config) => {
      await client.fastGet(remotePath(config.path, remoteName), localPath);
      return { success: true };
    });
  }

  async delete(remoteName) {
    return this.withClient(async (client, config) => {
      await client.delete(remotePath(config.path, remoteName));
      return { success: true };
    });
  }

  async test() {
    const startedAt = Date.now();
    try {
      await this.withClient(async (client, config) => {
        await client.exists(config.path);
      });
      return { success: true, message: "Connected", latencyMs: Date.now() - startedAt };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}
