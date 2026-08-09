/**
 * Common interface every backup destination implements. Concrete
 * destinations (local, sftp, google-drive, ...) extend this and override
 * the methods they support; unimplemented stubs (smb/ftp/rsync) rely on
 * these throwing defaults.
 */
export class BackupDestination {
  constructor(config = {}) {
    this.config = config;
  }

  async upload(_filePath, _remoteName) {
    throw new Error(`upload() not implemented for ${this.constructor.name}`);
  }

  async list() {
    throw new Error(`list() not implemented for ${this.constructor.name}`);
  }

  async download(_remoteName, _localPath) {
    throw new Error(`download() not implemented for ${this.constructor.name}`);
  }

  async delete(_remoteName) {
    throw new Error(`delete() not implemented for ${this.constructor.name}`);
  }

  async test() {
    throw new Error(`test() not implemented for ${this.constructor.name}`);
  }
}
