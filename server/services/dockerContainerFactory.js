import { createLogger } from "../utils/logger.js";

const log = createLogger("DockerContainerFactory");

const DEFAULT_IMAGE = "eclipse-temurin:21-jre";
const BASE_GAME_PORT = 16261;
const BASE_RCON_PORT = 27015;
const MANAGED_LABEL = "zomboid-panel.managed";
const SERVER_ID_LABEL = "zomboid-panel.server-id";

export function createDockerContainerFactory(dockerClient, volumeManager) {
  // config.basePath: when set, bind-mounts an existing host directory
  // (e.g. /mnt/user/appdata/steamcmd/pz-server) instead of the named volume.
  function baseMount(config) {
    if (config.basePath) return `${config.basePath}:/opt/pz-server:ro`;
    return "zomboid-panel-base:/opt/pz-server:ro";
  }

  function buildContainerSpec(config) {
    const image = config.image || DEFAULT_IMAGE;
    const gamePort = config.gamePort || BASE_GAME_PORT;
    const rconPort = config.rconPort || BASE_RCON_PORT;
    return {
      Image: image,
      Env: [
        `RCON_PORT=${rconPort}`,
        `RCON_PASSWORD=${config.rconPassword}`,
        `GAME_PORT=${gamePort}`,
        `MIN_MEMORY=${config.minMemoryMb || 2048}m`,
        `MAX_MEMORY=${config.maxMemoryMb || 4096}m`,
      ],
      Labels: {
        [MANAGED_LABEL]: "true",
        [SERVER_ID_LABEL]: config.serverName,
      },
      ExposedPorts: {
        [`${gamePort}/udp`]: {},
        [`${rconPort}/tcp`]: {},
      },
      HostConfig: {
        Binds: [
          baseMount(config),
          `zomboid-srv-${config.serverName}:/opt/pz-data`,
        ],
        PortBindings: {
          [`${gamePort}/udp`]: [{ HostPort: String(gamePort) }],
          [`${rconPort}/tcp`]: [{ HostPort: String(rconPort) }],
        },
      },
    };
  }

  function findAvailablePorts(existingServers) {
    const usedGame = new Set(existingServers.map((s) => s.gamePort).filter(Boolean));
    const usedRcon = new Set(existingServers.map((s) => s.rconPort).filter(Boolean));
    let gamePort = BASE_GAME_PORT;
    let rconPort = BASE_RCON_PORT;
    while (usedGame.has(gamePort)) gamePort++;
    while (usedRcon.has(rconPort)) rconPort++;
    return { gamePort, rconPort };
  }

  async function createManagedServer(config) {
    // Skip base volume creation when using an existing host path
    if (!config.basePath) {
      const volumeResult = await volumeManager.ensureBaseVolume();
      if (!volumeResult.success) {
        return { success: false, error: "Failed to ensure base volume" };
      }
    }
    const srvResult = await volumeManager.createServerVolume(config.serverName);
    if (!srvResult.success) {
      return { success: false, error: `Failed to create server volume: ${srvResult.volumeName}` };
    }

    const imageCheck = await dockerClient.inspectImage(config.image || DEFAULT_IMAGE);
    if (!imageCheck) {
      log.info(`Pulling image ${config.image || DEFAULT_IMAGE}...`);
      const pullResult = await dockerClient.pullImage(config.image || DEFAULT_IMAGE);
      if (!pullResult.success) {
        return { success: false, error: `Image pull failed: ${pullResult.error}` };
      }
    }

    const spec = buildContainerSpec(config);
    const containerName = `zomboid-${config.serverName}`;
    const createResult = await dockerClient.createContainer(spec, containerName);
    if (!createResult.success) {
      return { success: false, error: `Container creation failed: ${createResult.error}` };
    }
    return { success: true, containerId: createResult.id, containerName };
  }

  async function removeManagedServer(containerId, removeData = false) {
    const removeResult = await dockerClient.removeContainer(containerId, true);
    if (!removeResult.success) {
      log.warn(`Failed to remove container ${containerId}: ${removeResult.error}`);
      return { success: false, error: removeResult.error };
    }
    // Volume cleanup is opt-in — data loss is irreversible
    if (removeData) {
      log.info(`removeData requested but server-name-to-volume mapping requires the server registry`);
    }
    return { success: true };
  }

  return { buildContainerSpec, findAvailablePorts, createManagedServer, removeManagedServer };
}
