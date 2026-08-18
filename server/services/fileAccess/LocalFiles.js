/**
 * LocalFiles — FileAccess implementation backed by the local filesystem.
 *
 * Wraps Node.js `fs` and `fs/promises`. Every mutating method returns
 * `{success, error?}` and never throws.
 */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { FileAccess } from "./FileAccess.js";

const MODE_MAP = { read: fs.constants.R_OK, write: fs.constants.W_OK };

export class LocalFiles extends FileAccess {
  constructor() {
    super("LocalFiles");
  }

  // ── Existence & stat ───────────────────────────────────────────────

  async exists(filePath) {
    try { await fsp.access(filePath); return true; }
    catch { return false; }
  }

  async stat(filePath) {
    try {
      const s = await fsp.stat(filePath);
      return { size: s.size, mtimeMs: s.mtimeMs, mode: s.mode, isDirectory: s.isDirectory() };
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  }

  async access(filePath, mode = "read") {
    try { await fsp.access(filePath, MODE_MAP[mode] ?? fs.constants.R_OK); return true; }
    catch { return false; }
  }

  // ── Read ───────────────────────────────────────────────────────────

  async readFile(filePath, encoding = "utf-8") {
    try {
      const data = await fsp.readFile(filePath, encoding);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async readFileBinary(filePath) {
    try {
      const data = await fsp.readFile(filePath);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async readBytes(filePath, offset, length) {
    let fh;
    try {
      fh = await fsp.open(filePath, "r");
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
      if (opts.atomic) {
        await this._writeAtomic(filePath, data, opts.mode);
      } else {
        await fsp.writeFile(filePath, data, opts.mode != null ? { mode: opts.mode } : undefined);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /** @private */
  async _writeAtomic(filePath, data, mode) {
    const dir = path.dirname(filePath);
    const tmp = path.join(dir, `.tmp-${crypto.randomBytes(6).toString("hex")}`);
    await fsp.writeFile(tmp, data, mode != null ? { mode } : undefined);
    await fsp.rename(tmp, filePath);
  }

  // ── Directory ──────────────────────────────────────────────────────

  async readdir(dirPath, opts = {}) {
    const entries = await fsp.readdir(dirPath, { withFileTypes: !!opts.withFileTypes });
    if (!opts.withFileTypes) return entries;
    return entries.map((d) => ({
      name: d.name,
      isDirectory: d.isDirectory(),
      isFile: d.isFile(),
    }));
  }

  async mkdir(dirPath, opts = {}) {
    try {
      await fsp.mkdir(dirPath, { recursive: true, ...opts });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────

  async unlink(filePath) {
    try { await fsp.unlink(filePath); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  }

  async rm(filePath, opts = {}) {
    try { await fsp.rm(filePath, opts); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  }

  // ── Move / Copy ────────────────────────────────────────────────────

  async rename(oldPath, newPath) {
    try { await fsp.rename(oldPath, newPath); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  }

  async copyFile(src, dest) {
    try { await fsp.copyFile(src, dest); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  }

  // ── Permissions ────────────────────────────────────────────────────

  async chmod(filePath, mode) {
    try { await fsp.chmod(filePath, mode); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  }

  // ── Streams ────────────────────────────────────────────────────────

  createReadStream(filePath, opts = {}) {
    return fs.createReadStream(filePath, opts);
  }

  createWriteStream(filePath, opts = {}) {
    return fs.createWriteStream(filePath, opts);
  }

  // ── Session (no-op for local) ──────────────────────────────────────

  async withSession(_opts, fn) {
    return fn({});
  }
}
