/**
 * DockerLifecycle — starts/stops a PZ server running as a Docker container.
 *
 * Extracted from ServerManager._startDockerContainer / _stopDockerContainer.
 * Delegates to a DockerClient instance for the actual Docker socket calls.
 */
import { Lifecycle } from "./Lifecycle.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("DockerLifecycle");

export class DockerLifecycle extends Lifecycle {
  /**
   * @param {object} deps
   * @param {object} deps.dockerClient - DockerClient instance
   * @param {string} deps.containerRef - container ID or name
   */
  constructor(deps) {
    super("DockerLifecycle");
    this._docker = deps.dockerClient;
    this._ref = deps.containerRef;
  }

  /** @returns {Promise<{success: boolean, error?: string, message?: string}>} */
  async launch() {
    const guardError = this._guard();
    if (guardError) return guardError;
    try {
      const running = await this._docker.isContainerRunning(this._ref);
      if (running) {
        return { success: false, error: "Server is already running" };
      }
      const result = await this._docker.startContainer(this._ref);
      if (!result.success) {
        return { success: false, error: result.error || "Failed to start Docker container" };
      }
      log.info(`Docker container started (ref=${this._ref})`);
      return { success: true, message: "Docker container started" };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /** @returns {Promise<{success: boolean, error?: string, message?: string}>} */
  async terminate() {
    const guardError = this._guard();
    if (guardError) return guardError;
    try {
      const result = await this._docker.stopContainer(this._ref);
      if (!result.success) {
        return { success: false, error: result.error || "Failed to stop Docker container" };
      }
      log.info(`Docker container stopped (ref=${this._ref})`);
      return { success: true, message: "Docker container stopped" };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /** @returns {Promise<boolean>} */
  async isRunning() {
    if (!this._docker?.available || !this._ref) return false;
    try {
      return await this._docker.isContainerRunning(this._ref);
    } catch {
      return false;
    }
  }

  /** @private @returns {{success: false, error: string}|null} */
  _guard() {
    if (!this._docker?.available) {
      return { success: false, error: "Docker client not available" };
    }
    if (!this._ref) {
      return { success: false, error: "No container reference configured" };
    }
    return null;
  }
}
