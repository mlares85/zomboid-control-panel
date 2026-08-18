/**
 * SftpMirrorFiles — FileAccess implementation for a remote server's config
 * folder, reached over SFTP through a local mirror directory.
 *
 * The remote host only exposes a handful of small config files (see
 * `mirroredFileNames` in remoteConfigFiles.js), so this is not a general
 * remote filesystem — it mirrors that fixed file set into a local directory,
 * lets callers read/write it like local disk, and pushes back whatever
 * changed. mkdir()'d directories and arbitrary new file names live only in
 * the local mirror: the push step only ever uploads the known config names.
 *
 * `withSession()` is how changes actually reach the host: it pulls fresh
 * copies, runs the callback, and pushes whatever the callback changed, all
 * under the shared mirror lock. Outside a session, reads fall back to the
 * freshness-cached mirror (see MIRROR_FRESH_MS in remoteConfigFiles.js);
 * writes land in the local mirror only, so call withSession to flush them
 * to the host.
 */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { FileAccess } from "./FileAccess.js";
import {
  validateRemoteConfigTransport,
  getMirrorPath,
  acquireMirrorLock,
  beginRemoteConfigSession,
  pullRemoteConfigFiles,
  pushRemoteConfigFiles,
  withClient,
} from "../remoteConfigFiles.js";

export class SftpMirrorFiles extends FileAccess {
  /** @param {{sftpConfig:{host:string,port?:number,username:string,password?:string,remotePath:string},serverName:string}} opts */
  constructor({ sftpConfig, serverName }) {
    super("SftpMirrorFiles");
    this.config = validateRemoteConfigTransport({
      ...sftpConfig,
      configPath: sftpConfig?.remotePath,
    });
    this.serverName = serverName;
    this.mirrorDir = getMirrorPath(this.config, serverName);
    this._session = null;
  }

  // ── Path helpers ───────────────────────────────────────────────────

  /**
   * Route handlers build paths as `path.join(configPath, name)`, and
   * `getServerConfigPath()` returns this mirror dir for remote servers — so
   * an absolute path arrives already resolved inside the mirror. A bare name
   * (as callers of this class working relatively pass) is joined normally.
   * @private
   */
  _localPath(filePath) {
    if (path.isAbsolute(filePath)) return filePath;
    return path.join(this.mirrorDir, filePath);
  }

  /** @private */
  _remotePath(filePath) {
    const rel = path.isAbsolute(filePath)
      ? path.relative(this.mirrorDir, filePath)
      : filePath;
    return `${this.config.configPath}/${rel}`;
  }

  /** @private Ensure the mirror is populated before a read outside a session. */
  async _ensureMirror() {
    if (this._session) return this._session;
    return beginRemoteConfigSession(this.config, this.serverName, { fresh: false });
  }

  // ── Session ────────────────────────────────────────────────────────

  async withSession(_opts, fn) {
    const release = await acquireMirrorLock();
    try {
      const session = await pullRemoteConfigFiles(this.config, this.serverName);
      this._session = session;
      const result = await fn(session);
      await pushRemoteConfigFiles(this.config, this.serverName, session);
      return result;
    } finally {
      this._session = null;
      release();
    }
  }

  // ── Existence & stat ───────────────────────────────────────────────

  async exists(filePath) {
    if (fs.existsSync(this._localPath(filePath))) return true;
    try {
      const stats = await withClient(this.config, (client) =>
        client.stat(this._remotePath(filePath)),
      );
      return !!stats;
    } catch {
      return false;
    }
  }

  async stat(filePath) {
    if (this._session) return this._statLocal(filePath);
    try {
      const s = await withClient(this.config, (client) =>
        client.stat(this._remotePath(filePath)),
      );
      return { size: Number(s.size), mtimeMs: Number(s.modifyTime || 0), isDirectory: !!s.isDirectory };
    } catch {
      return null;
    }
  }

  /** @private */
  async _statLocal(filePath) {
    try {
      const s = await fsp.stat(this._localPath(filePath));
      return { size: s.size, mtimeMs: s.mtimeMs, isDirectory: s.isDirectory() };
    } catch {
      return null;
    }
  }

  async access(filePath, mode = "read") {
    if (mode === "write") return true;
    return this.exists(filePath);
  }

  // ── Read ───────────────────────────────────────────────────────────

  async readFile(filePath, encoding = "utf-8") {
    try {
      await this._ensureMirror();
      const data = await fsp.readFile(this._localPath(filePath), encoding);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async readFileBinary(filePath) {
    try {
      await this._ensureMirror();
      const data = await fsp.readFile(this._localPath(filePath));
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async readBytes(filePath, offset, length) {
    let fh;
    try {
      await this._ensureMirror();
      fh = await fsp.open(this._localPath(filePath), "r");
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      return { success: true, data: buf.subarray(0, bytesRead) };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      await fh?.close();
    }
  }

  // ── Write ──────────────────────────────────────────────────────────

  async writeFile(filePath, data, opts = {}) {
    try {
      const local = this._localPath(filePath);
      await fsp.mkdir(path.dirname(local), { recursive: true });
      if (opts.atomic) {
        await this._writeAtomic(local, data, opts.mode);
      } else {
        await fsp.writeFile(local, data, opts.mode != null ? { mode: opts.mode } : undefined);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /** @private */
  async _writeAtomic(local, data, mode) {
    const tmp = path.join(path.dirname(local), `.tmp-${crypto.randomBytes(6).toString("hex")}`);
    await fsp.writeFile(tmp, data, mode != null ? { mode } : undefined);
    await fsp.rename(tmp, local);
  }

  // ── Directory ──────────────────────────────────────────────────────

  async readdir(dirPath, opts = {}) {
    if (this._session) return this._readdirLocal(dirPath, opts);
    return this._readdirRemote(dirPath, opts);
  }

  /** @private */
  async _readdirLocal(dirPath, opts) {
    const entries = await fsp.readdir(this._localPath(dirPath), {
      withFileTypes: !!opts.withFileTypes,
    });
    if (!opts.withFileTypes) return entries;
    return entries.map((d) => ({ name: d.name, isDirectory: d.isDirectory(), isFile: d.isFile() }));
  }

  /** @private */
  async _readdirRemote(dirPath, opts) {
    const list = await withClient(this.config, (client) =>
      client.list(this._remotePath(dirPath)),
    );
    if (!opts.withFileTypes) return list.map((e) => e.name);
    return list.map((e) => ({ name: e.name, isDirectory: e.type === "d", isFile: e.type === "-" }));
  }

  async mkdir(dirPath, opts = {}) {
    try {
      await fsp.mkdir(this._localPath(dirPath), { recursive: true, ...opts });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────

  async unlink(filePath) {
    try {
      await fsp.unlink(this._localPath(filePath));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async rm(filePath, opts = {}) {
    try {
      await fsp.rm(this._localPath(filePath), opts);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ── Move / Copy ────────────────────────────────────────────────────

  async rename(oldPath, newPath) {
    try {
      await fsp.rename(this._localPath(oldPath), this._localPath(newPath));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async copyFile(src, dest) {
    try {
      await fsp.copyFile(this._localPath(src), this._localPath(dest));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ── Permissions ────────────────────────────────────────────────────

  async chmod(filePath, mode) {
    try {
      await fsp.chmod(this._localPath(filePath), mode);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ── Streams (unsupported for remote servers) ────────────────────────

  createReadStream() {
    throw new Error("createReadStream is not supported for remote servers");
  }

  createWriteStream() {
    throw new Error("createWriteStream is not supported for remote servers");
  }
}
