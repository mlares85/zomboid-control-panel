import fs from "fs";
import path from "path";
import { BackupDestination } from "./base.js";

// Defense-in-depth: remoteName ultimately comes from a backup filename we
// generated ourselves, but destination implementations shouldn't trust that.
function safeName(name) {
  return path.basename(String(name));
}

export class LocalDestination extends BackupDestination {
  constructor(config = {}) {
    super(config);
    this.dir = config.path;
  }

  async upload(filePath, remoteName) {
    if (!this.dir) throw new Error("Local destination has no path configured");
    fs.mkdirSync(this.dir, { recursive: true });
    const dest = path.join(this.dir, safeName(remoteName));
    await fs.promises.copyFile(filePath, dest);
    return { success: true, remotePath: dest };
  }

  async list() {
    if (!this.dir || !fs.existsSync(this.dir)) return [];
    const names = await fs.promises.readdir(this.dir);
    const entries = await Promise.all(
      names.map(async (name) => {
        try {
          const full = path.join(this.dir, name);
          const stat = await fs.promises.stat(full);
          if (!stat.isFile()) return null;
          return { name, size: stat.size, modified: stat.mtime.toISOString() };
        } catch {
          return null;
        }
      }),
    );
    return entries.filter(Boolean);
  }

  async download(remoteName, localPath) {
    if (!this.dir) throw new Error("Local destination has no path configured");
    await fs.promises.copyFile(path.join(this.dir, safeName(remoteName)), localPath);
    return { success: true };
  }

  async delete(remoteName) {
    if (!this.dir) throw new Error("Local destination has no path configured");
    await fs.promises.unlink(path.join(this.dir, safeName(remoteName)));
    return { success: true };
  }

  async test() {
    if (!this.dir) return { success: false, message: "No path configured" };
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const probe = path.join(this.dir, `.write-test-${Date.now()}`);
      fs.writeFileSync(probe, "ok");
      fs.unlinkSync(probe);
      return { success: true, message: `${this.dir} is writable` };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}
