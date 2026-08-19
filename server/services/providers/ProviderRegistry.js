import { createLogger } from "../../utils/logger.js";

const log = createLogger("ProviderRegistry");

/**
 * Static registry of server provider types. Each entry declares which
 * capabilities it supports and how to create them from a server config
 * and injected dependencies.
 *
 * Usage:
 *   const entry = registry.get("docker-managed");
 *   const caps = entry.create(deps, serverConfig);
 *   // caps = { lifecycle: DockerLifecycle, files: LocalFiles, installer: ContainerSteamCmdInstaller }
 */
export class ProviderRegistry {
  constructor() {
    this._entries = new Map();
  }

  register(providerType, entry) {
    this._entries.set(providerType, entry);
  }

  get(providerType) {
    return this._entries.get(providerType) || null;
  }

  has(providerType) {
    return this._entries.has(providerType);
  }

  /** @returns {string[]} all registered provider type names */
  types() {
    return [...this._entries.keys()];
  }

  /**
   * Create the capability composition for a server config.
   * @param {string} providerType
   * @param {object} deps - shared services (dockerClient, etc.)
   * @param {object} serverConfig - the server record from the database
   * @returns {{ lifecycle: Lifecycle|null, files: FileAccess|null, installer: Installer|null }}
   *   (a `stats` slot is planned per ARCHITECTURE.md but not yet implemented)
   */
  createCapabilities(providerType, deps, serverConfig) {
    const entry = this.get(providerType);
    if (!entry) {
      log.warn(`Unknown provider type: ${providerType}`);
      return { lifecycle: null, files: null, installer: null };
    }
    return entry.create(deps, serverConfig);
  }
}
