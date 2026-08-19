/**
 * Lifecycle — abstract base class for starting and stopping a PZ server process.
 *
 * Every method throws "not implemented" by default. Subclasses override with
 * real implementations. This IS the interface — enforced via contract tests,
 * not TypeScript (same pattern as Installer and FileAccess).
 *
 * Design:
 *   - `launch()` starts the server.
 *   - `terminate()` force-stops the server.
 *   - `isRunning()` checks current run state.
 *
 * Planned adapters:
 *   - DockerLifecycle (Docker container start/stop)
 *   - NativeLifecycle (child process spawn/kill) — not yet extracted
 *   - remote-sftp providers have no Lifecycle (null)
 */

/** @abstract */
export class Lifecycle {
  /** @param {string} name - identifier for logging */
  constructor(name = "Lifecycle") {
    if (new.target === Lifecycle) {
      throw new Error("Lifecycle is abstract — use a subclass");
    }
    this.name = name;
  }

  /**
   * Start the server.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async launch() { throw this._notImpl("launch"); }

  /**
   * Force-stop the server.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async terminate() { throw this._notImpl("terminate"); }

  /**
   * Check if the server is currently running.
   * @returns {Promise<boolean>}
   */
  async isRunning() { throw this._notImpl("isRunning"); }

  /** @private */
  _notImpl(method) {
    return new Error(`${this.name}.${method}() is not implemented`);
  }
}
