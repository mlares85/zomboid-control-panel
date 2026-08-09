import fs from "fs";
import { BackupDestination } from "./base.js";
import { refreshAccessToken } from "./googleDriveOAuth.js";

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
// Google requires resumable chunk sizes to be a multiple of 256 KiB; 8 MiB
// keeps memory use bounded on multi-GB save backups without too many round trips.
const CHUNK_SIZE = 8 * 1024 * 1024;

export class GoogleDriveDestination extends BackupDestination {
  constructor(config = {}) {
    super(config);
    this._accessToken = config.accessToken || null;
    this._accessTokenExpiresAt = config.accessTokenExpiresAt || 0;
  }

  async getAccessToken() {
    if (this._accessToken && Date.now() < this._accessTokenExpiresAt - 30000) {
      return this._accessToken;
    }
    if (!this.config.refreshToken) {
      throw new Error("Google Drive destination is not connected yet (no refresh token)");
    }
    const { accessToken, expiresAt } = await refreshAccessToken({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      refreshToken: this.config.refreshToken,
    });
    this._accessToken = accessToken;
    this._accessTokenExpiresAt = expiresAt;
    return accessToken;
  }

  async _findFileId(remoteName) {
    const token = await this.getAccessToken();
    const parentClause = this.config.folderId ? ` and '${this.config.folderId}' in parents` : "";
    const query = `name = '${remoteName.replace(/'/g, "\\'")}' and trashed = false${parentClause}`;
    const url = `${DRIVE_API}?q=${encodeURIComponent(query)}&fields=files(id,name)`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Google Drive lookup failed (HTTP ${res.status})`);
    const body = await res.json();
    return body.files?.[0]?.id || null;
  }

  async _initResumableSession(token, remoteName, fileSize) {
    const res = await fetch(`${DRIVE_UPLOAD_API}?uploadType=resumable`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(fileSize),
      },
      body: JSON.stringify({
        name: remoteName,
        parents: this.config.folderId ? [this.config.folderId] : undefined,
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to start Google Drive upload session (HTTP ${res.status}): ${await res.text()}`);
    }
    const location = res.headers.get("location");
    if (!location) throw new Error("Google Drive did not return a resumable upload URL");
    return location;
  }

  async _uploadChunks(sessionUrl, filePath, fileSize) {
    const fh = await fs.promises.open(filePath, "r");
    try {
      let offset = 0;
      let lastJson = null;
      while (offset < fileSize) {
        const end = Math.min(offset + CHUNK_SIZE, fileSize) - 1;
        const length = end - offset + 1;
        const buffer = Buffer.alloc(length);
        await fh.read(buffer, 0, length, offset);
        const res = await fetch(sessionUrl, {
          method: "PUT",
          headers: { "Content-Length": String(length), "Content-Range": `bytes ${offset}-${end}/${fileSize}` },
          body: buffer,
        });
        if (res.status === 200 || res.status === 201) {
          lastJson = await res.json();
        } else if (res.status !== 308) {
          throw new Error(`Google Drive upload chunk failed (HTTP ${res.status}): ${await res.text()}`);
        }
        offset = end + 1;
      }
      return lastJson;
    } finally {
      await fh.close();
    }
  }

  async upload(filePath, remoteName) {
    const token = await this.getAccessToken();
    const stat = await fs.promises.stat(filePath);
    const sessionUrl = await this._initResumableSession(token, remoteName, stat.size);
    const result = await this._uploadChunks(sessionUrl, filePath, stat.size);
    return {
      success: true,
      remotePath: result?.id ? `gdrive:${result.id}` : null,
      driveFileId: result?.id || null,
    };
  }

  async list() {
    const token = await this.getAccessToken();
    const parentClause = this.config.folderId ? `'${this.config.folderId}' in parents and ` : "";
    const url = `${DRIVE_API}?q=${encodeURIComponent(`${parentClause}trashed = false`)}&fields=files(id,name,size,modifiedTime)&pageSize=200`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Google Drive list failed (HTTP ${res.status})`);
    const body = await res.json();
    return (body.files || []).map((f) => ({
      name: f.name,
      size: Number(f.size) || 0,
      modified: f.modifiedTime || null,
      driveFileId: f.id,
    }));
  }

  async download(remoteName, localPath) {
    const token = await this.getAccessToken();
    const fileId = await this._findFileId(remoteName);
    if (!fileId) throw new Error(`File not found on Google Drive: ${remoteName}`);
    const res = await fetch(`${DRIVE_API}/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok || !res.body) throw new Error(`Google Drive download failed (HTTP ${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.promises.writeFile(localPath, buffer);
    return { success: true };
  }

  async delete(remoteName) {
    const token = await this.getAccessToken();
    const fileId = await this._findFileId(remoteName);
    if (!fileId) throw new Error(`File not found on Google Drive: ${remoteName}`);
    const res = await fetch(`${DRIVE_API}/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 404) throw new Error(`Google Drive delete failed (HTTP ${res.status})`);
    return { success: true };
  }

  async test() {
    const startedAt = Date.now();
    try {
      const token = await this.getAccessToken();
      const res = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { success: false, message: `Google Drive rejected the request (HTTP ${res.status})` };
      const body = await res.json();
      return {
        success: true,
        message: `Connected as ${body.user?.emailAddress || "unknown account"}`,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}
