/**
 * Installer — abstract base class for PZ server install/update operations.
 *
 * Every method throws "not implemented" by default. Subclasses override with
 * real implementations. This IS the interface — enforced via contract tests,
 * not TypeScript (same pattern as FileAccess).
 *
 * Design:
 *   - `install()` downloads PZ server files into a target directory.
 *   - `update()` updates/verifies an existing PZ server installation.
 *   - `isAvailable()` checks if the installer can run on this system.
 *   - Progress is reported via an `emitter` callback, not Socket.IO directly,
 *     so the service stays testable without a live server.
 *
 * Two planned adapters:
 *   - NativeSteamCmdInstaller (child process on host)
 *   - ContainerSteamCmdInstaller (Docker container)
 */

/** @abstract */
export class Installer {
  /** @param {string} name - identifier for logging */
  constructor(name = "Installer") {
    if (new.target === Installer) {
      throw new Error("Installer is abstract — use a subclass");
    }
    this.name = name;
  }

  /**
   * Check if this installer can run on the current system.
   * @returns {Promise<{available: boolean, reason?: string}>}
   */
  async isAvailable() { throw this._notImpl("isAvailable"); }

  /**
   * Install PZ server files into `installPath`.
   * @param {object} config
   * @param {string} config.installPath - where to install PZ server files
   * @param {string} config.branch - Steam branch (e.g. "public", "unstable")
   * @param {(event: string, data: object) => void} config.onProgress - progress callback
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async install(_config) { throw this._notImpl("install"); }

  /**
   * Update/verify an existing PZ server installation.
   * @param {object} config
   * @param {string} config.installPath - the existing PZ server directory
   * @param {string} config.branch - Steam branch
   * @param {boolean} [config.validate=false] - run file validation
   * @param {(event: string, data: object) => void} config.onProgress - progress callback
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async update(_config) { throw this._notImpl("update"); }

  /** @private */
  _notImpl(method) {
    return new Error(`${this.name}.${method}() is not implemented`);
  }
}
