/**
 * FileAccess — abstract base class defining the filesystem contract.
 *
 * Every method throws "not implemented" by default. Subclasses (LocalFiles,
 * SftpFiles) override with real implementations. This IS the interface in
 * a plain-JS codebase.
 */

/** @abstract */
export class FileAccess {
  /** @param {string} name - identifier for logging */
  constructor(name = "FileAccess") {
    if (new.target === FileAccess) {
      throw new Error("FileAccess is abstract — use a subclass");
    }
    this.name = name;
  }

  // ── Existence & stat ───────────────────────────────────────────────

  /** @abstract @param {string} filePath @returns {Promise<boolean>} */
  async exists(filePath) { throw this._notImpl("exists"); }

  /** @abstract @param {string} filePath @returns {Promise<{size:number,mtimeMs:number,isDirectory:boolean}|null>} */
  async stat(filePath) { throw this._notImpl("stat"); }

  /** @abstract @param {string} filePath @param {'read'|'write'} mode @returns {Promise<boolean>} */
  async access(filePath, mode = "read") { throw this._notImpl("access"); }

  // ── Read ───────────────────────────────────────────────────────────

  /** @abstract @param {string} filePath @param {string} [encoding='utf-8'] @returns {Promise<{success:true,data:string}|{success:false,error:string}>} */
  async readFile(filePath, encoding = "utf-8") { throw this._notImpl("readFile"); }

  /** @abstract @param {string} filePath @returns {Promise<{success:true,data:Buffer}|{success:false,error:string}>} */
  async readFileBinary(filePath) { throw this._notImpl("readFileBinary"); }

  /** @abstract @param {string} filePath @param {number} offset @param {number} length @returns {Promise<{success:true,data:Buffer}|{success:false,error:string}>} */
  async readBytes(filePath, offset, length) { throw this._notImpl("readBytes"); }

  // ── Write ──────────────────────────────────────────────────────────

  /** @abstract @param {string} filePath @param {string|Buffer} data @param {{atomic?:boolean,mode?:number}} [opts] @returns {Promise<{success:true}|{success:false,error:string}>} */
  async writeFile(filePath, data, opts = {}) { throw this._notImpl("writeFile"); }

  // ── Directory ──────────────────────────────────────────────────────

  /** @abstract @param {string} dirPath @param {{withFileTypes?:boolean}} [opts] @returns {Promise<string[]|Array<{name:string,isDirectory:boolean,isFile:boolean}>>} */
  async readdir(dirPath, opts = {}) { throw this._notImpl("readdir"); }

  /** @abstract @param {string} dirPath @param {object} [opts] @returns {Promise<{success:true}|{success:false,error:string}>} */
  async mkdir(dirPath, opts = {}) { throw this._notImpl("mkdir"); }

  // ── Delete ─────────────────────────────────────────────────────────

  /** @abstract @param {string} filePath @returns {Promise<{success:true}|{success:false,error:string}>} */
  async unlink(filePath) { throw this._notImpl("unlink"); }

  /** @abstract @param {string} filePath @param {object} [opts] @returns {Promise<{success:true}|{success:false,error:string}>} */
  async rm(filePath, opts = {}) { throw this._notImpl("rm"); }

  // ── Move / Copy ────────────────────────────────────────────────────

  /** @abstract @param {string} oldPath @param {string} newPath @returns {Promise<{success:true}|{success:false,error:string}>} */
  async rename(oldPath, newPath) { throw this._notImpl("rename"); }

  /** @abstract @param {string} src @param {string} dest @returns {Promise<{success:true}|{success:false,error:string}>} */
  async copyFile(src, dest) { throw this._notImpl("copyFile"); }

  // ── Permissions ────────────────────────────────────────────────────

  /** @abstract @param {string} filePath @param {number} mode @returns {Promise<{success:true}|{success:false,error:string}>} */
  async chmod(filePath, mode) { throw this._notImpl("chmod"); }

  // ── Streams (synchronous — return Node stream objects) ─────────────

  /** @abstract @param {string} filePath @param {object} [opts] @returns {import('fs').ReadStream} */
  createReadStream(filePath, opts = {}) { throw this._notImpl("createReadStream"); }

  /** @abstract @param {string} filePath @param {object} [opts] @returns {import('fs').WriteStream} */
  createWriteStream(filePath, opts = {}) { throw this._notImpl("createWriteStream"); }

  // ── Session semantics ──────────────────────────────────────────────

  /**
   * Run `fn` inside a session (e.g. an SFTP connection).
   * Local impl is a no-op; SFTP impl manages connection lifecycle.
   * @abstract
   * @template T
   * @param {{serverName?:string,fresh?:boolean}} opts
   * @param {(session:object) => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async withSession(opts, fn) { throw this._notImpl("withSession"); }

  // ── Internal ───────────────────────────────────────────────────────

  /** @private */
  _notImpl(method) {
    return new Error(`${this.name}.${method}() is not implemented`);
  }
}
