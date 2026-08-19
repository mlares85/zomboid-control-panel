// Startup diagnostics for common misconfigurations that otherwise surface as
// confusing runtime errors (permission denied, RCON unreachable, a
// docker-managed server whose container was recreated by hand). Every check
// is best-effort and never throws — a broken check here must not block boot.
import fs from "fs";
import { getServers } from "../database/init.js";
import { PROVIDERS, isRemoteProvider } from "./serverProvider.js";

const MANAGED_LABEL = "zomboid-panel.managed";

// Owner/UID mismatch (common in Docker with PUID/PGID misconfigured) and
// missing bind mounts both hinge on stat()-ing the same path, so one pass
// covers both checks.
async function checkPathOwnershipAndExistence(name, pathKey, pathValue, processUid, log) {
  if (!pathValue) return;
  try {
    const stats = await fs.promises.stat(pathValue);
    if (processUid != null && stats.uid !== processUid) {
      log.warn(
        `Path ${pathValue} is owned by UID ${stats.uid} but panel runs as UID ${processUid}. Set PUID=${stats.uid} PGID=${stats.gid} to fix permission errors.`,
      );
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      log.warn(
        `Server "${name}" ${pathKey} ${pathValue} does not exist. Check your Docker volume mounts.`,
      );
    }
  }
}

async function checkDockerManagedLabel(server, dockerClient, log) {
  if (server.provider !== PROVIDERS.DOCKER_MANAGED || !server.dockerContainerId) return;
  if (!dockerClient?.available) return;
  const info = await dockerClient.inspectContainer(server.dockerContainerId).catch(() => null);
  const managed = info?.Config?.Labels?.[MANAGED_LABEL] === "true";
  if (!managed) {
    log.warn(
      `Server "${server.name}" is marked docker-managed but container doesn't have the managed label. Should this be docker-local?`,
    );
  }
}

function checkRconLoopback(server, panelIsContainerized, log) {
  if (server.rconHost !== "127.0.0.1" || !panelIsContainerized) return;
  log.info(
    `Server "${server.name}" uses rconHost=127.0.0.1 inside a container. If RCON fails, try using the PZ container's Docker network name instead.`,
  );
}

export async function validateStartupConfig(serverManager, dockerClient, log) {
  try {
    const processUid = typeof process.getuid === "function" ? process.getuid() : null;
    const panelIsContainerized = fs.existsSync("/.dockerenv");
    const servers = await getServers();

    for (const server of servers) {
      if (!isRemoteProvider(server)) {
        await checkPathOwnershipAndExistence(
          server.name,
          "installPath",
          server.installPath,
          processUid,
          log,
        );
        await checkPathOwnershipAndExistence(
          server.name,
          "zomboidDataPath",
          server.zomboidDataPath,
          processUid,
          log,
        );
      }
      await checkDockerManagedLabel(server, dockerClient, log);
      checkRconLoopback(server, panelIsContainerized, log);
    }
  } catch (err) {
    log.debug(`Startup validation skipped due to error: ${err.message}`);
  }
}
