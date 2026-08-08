// Server "provider" describes how the panel reaches a configured PZ server,
// replacing the old isRemote boolean which conflated "different machine" with
// "no local filesystem access" and mis-tagged Docker-to-Docker setups (both
// containers sharing bind-mounted volumes) as remote/SFTP-only.
import { isContainerized } from "./dockerDetect.js";

export const PROVIDERS = {
  NATIVE: "native", // PZ on the host or same container
  DOCKER_LOCAL: "docker-local", // PZ in a separate container; panel has files via bind mounts
  DOCKER_MANAGED: "docker-managed", // panel created and owns the container (future)
  REMOTE_SFTP: "remote-sftp", // PZ on a different machine, accessed via SFTP
};

const VALID_PROVIDERS = new Set(Object.values(PROVIDERS));

export function isValidProvider(value) {
  return VALID_PROVIDERS.has(value);
}

/**
 * Auto-detect a provider for a server with no explicit `provider` stored.
 * Mirrors the legacy isRemote auto-detection so upgraded servers keep
 * behaving the same way: paths that don't exist locally mean remote-sftp;
 * paths that do exist locally mean native, or docker-local when the panel
 * itself is containerized (bind-mounted volumes are the common topology).
 */
export function detectProvider({ isRemote, pathsConfigured, pathsExistLocally }) {
  const effectiveIsRemote = pathsConfigured
    ? !pathsExistLocally
    : Boolean(isRemote);
  if (effectiveIsRemote) return PROVIDERS.REMOTE_SFTP;
  return pathsExistLocally && isContainerized()
    ? PROVIDERS.DOCKER_LOCAL
    : PROVIDERS.NATIVE;
}

// True only for servers reached exclusively over SFTP — no shared filesystem,
// no locally-manageable process.
export function isRemoteProvider(server) {
  return server?.provider === PROVIDERS.REMOTE_SFTP;
}

// True when the panel can read/write the server's files directly (native and
// docker-local both have local files via bind mounts; only remote-sftp doesn't).
export function isLocalFileAccess(server) {
  return server?.provider !== PROVIDERS.REMOTE_SFTP;
}

export function isDockerManaged(server) {
  return server?.provider === PROVIDERS.DOCKER_MANAGED;
}
