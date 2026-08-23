import { createLogger } from "../../utils/logger.js";

const log = createLogger("API:DockerManaged");

const VALID_RESTART_POLICIES = ["no", "on-failure", "unless-stopped", "always"];

export function validateManagedServerInput(body) {
  if (!body.serverName || typeof body.serverName !== "string") return "serverName is required";
  if (body.gamePort !== undefined && typeof body.gamePort !== "number") return "gamePort must be a number";
  if (body.rconPort !== undefined && typeof body.rconPort !== "number") return "rconPort must be a number";
  if (!body.rconPassword || body.rconPassword.length < 6) return "rconPassword must be at least 6 characters";
  if (body.restartPolicy && !VALID_RESTART_POLICIES.includes(body.restartPolicy)) {
    return `restartPolicy must be one of: ${VALID_RESTART_POLICIES.join(", ")}`;
  }
  if (body.dockerMemoryMb !== undefined && (typeof body.dockerMemoryMb !== "number" || body.dockerMemoryMb < 512)) {
    return "dockerMemoryMb must be a number >= 512";
  }
  if (body.cpuLimit !== undefined && (typeof body.cpuLimit !== "number" || body.cpuLimit <= 0)) {
    return "cpuLimit must be a positive number";
  }
  if (body.timezone !== undefined && typeof body.timezone !== "string") return "timezone must be a string";
  return null;
}

// When the panel runs in a container, paths the user enters (e.g. /pz-server)
// are container-internal. Docker bind mounts resolve against the HOST.
// Resolve by inspecting the panel container's mounts via the Docker API.
let hostPathCache = null;
let hostPathCacheAt = 0;
const HOST_PATH_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function resolveHostPath(containerPath, dockerClient) {
  if (!containerPath) return containerPath;
  if (!hostPathCache || Date.now() - hostPathCacheAt > HOST_PATH_CACHE_TTL) {
    hostPathCache = new Map();
    hostPathCacheAt = Date.now();
    for (const name of ["zomboid-panel", "zomboid-control-panel"]) {
      const info = await dockerClient.inspectContainer(name);
      if (!info?.Mounts) continue;
      for (const m of info.Mounts) {
        if (m.Destination && m.Source) hostPathCache.set(m.Destination, m.Source);
      }
      break;
    }
  }
  if (hostPathCache.has(containerPath)) return hostPathCache.get(containerPath);
  let bestMount = "";
  let bestHost = "";
  for (const [dest, src] of hostPathCache) {
    if (containerPath.startsWith(dest + "/") && dest.length > bestMount.length) {
      bestMount = dest;
      bestHost = src;
    }
  }
  if (bestMount) {
    const resolved = containerPath.replace(bestMount, bestHost);
    log.info(`Resolved container path ${containerPath} → host path ${resolved}`);
    return resolved;
  }
  return containerPath;
}
