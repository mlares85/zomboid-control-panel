import { createLogger } from "../utils/logger.js";

const log = createLogger("DockerContainerFactory");

const DEFAULT_IMAGE = "eclipse-temurin:21-jre";
const BASE_GAME_PORT = 16261;
const BASE_RCON_PORT = 27015;
const MANAGED_LABEL = "zomboid-panel.managed";
const SERVER_ID_LABEL = "zomboid-panel.server-id";
const PANEL_NETWORK = "zomboid-panel-net";

export function createDockerContainerFactory(dockerClient, volumeManager) {
  // Bind-mounts an existing host directory or the shared named volume.
  function baseMount(config) {
    if (config.basePath) return `${config.basePath}:/opt/pz-server:ro`;
    return "zomboid-panel-base:/opt/pz-server:ro";
  }

  // Ensure the panel network exists for internal RCON traffic.
  async function ensureNetwork() {
    try {
      const result = await dockerClient._requestJson("GET", `/networks/${PANEL_NETWORK}`);
      if (result.success) return true;
    } catch { /* doesn't exist yet */ }
    const create = await dockerClient._requestJson("POST", "/networks/create", {
      Name: PANEL_NETWORK, Driver: "bridge",
      Labels: { [MANAGED_LABEL]: "true" },
    });
    if (!create.success) log.warn(`Failed to create panel network: ${create.error}`);
    return create.success;
  }

  function buildContainerSpec(config) {
    const image = config.image || DEFAULT_IMAGE;
    const gamePort = config.gamePort || BASE_GAME_PORT;
    const rconPort = config.rconPort || BASE_RCON_PORT;
    return {
      Image: image,
      Cmd: ["/opt/pz-server/start-server.sh", "-servername", config.serverName],
      Env: [
        `HOME=/opt/pz-data`,
        `RCON_PORT=${rconPort}`,
        `RCON_PASSWORD=${config.rconPassword}`,
        `GAME_PORT=${gamePort}`,
        `PZ_SERVER_ARGS=-Xms${config.minMemoryMb || 2048}m -Xmx${config.maxMemoryMb || 4096}m`,
      ],
      Labels: {
        [MANAGED_LABEL]: "true",
        [SERVER_ID_LABEL]: config.serverName,
      },
      ExposedPorts: {
        [`${gamePort}/udp`]: {},
        [`${gamePort + 1}/udp`]: {},
        [`${rconPort}/tcp`]: {},
      },
      HostConfig: {
        Binds: [
          baseMount(config),
          `zomboid-srv-${config.serverName}:/opt/pz-data`,
        ],
        PortBindings: {
          [`${gamePort}/udp`]: [{ HostPort: String(gamePort) }],
          [`${gamePort + 1}/udp`]: [{ HostPort: String(gamePort + 1) }],
          [`${rconPort}/tcp`]: [{ HostPort: String(rconPort) }],
        },
        NetworkMode: PANEL_NETWORK,
      },
    };
  }

  function findAvailablePorts(existingServers) {
    const usedGame = new Set(existingServers.map((s) => s.gamePort).filter(Boolean));
    const usedRcon = new Set(existingServers.map((s) => s.rconPort).filter(Boolean));
    let gamePort = BASE_GAME_PORT;
    let rconPort = BASE_RCON_PORT;
    while (usedGame.has(gamePort) || usedGame.has(gamePort + 1)) gamePort += 2;
    while (usedRcon.has(rconPort)) rconPort++;
    return { gamePort, rconPort };
  }

  async function createManagedServer(config) {
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

    const imageRef = config.image || DEFAULT_IMAGE;
    const imageCheck = await dockerClient.inspectImage(imageRef);
    if (!imageCheck) {
      log.info(`Pulling image ${imageRef}...`);
      const pullResult = await dockerClient.pullImage(imageRef);
      if (!pullResult.success) {
        return { success: false, error: `Image pull failed: ${pullResult.error}` };
      }
    }

    await ensureNetwork();
    const spec = buildContainerSpec(config);
    const containerName = `zomboid-${config.serverName}`;
    const createResult = await dockerClient.createContainer(spec, containerName);
    if (!createResult.success) {
      return { success: false, error: `Container creation failed: ${createResult.error}` };
    }
    return { success: true, containerId: createResult.id, containerName };
  }

  async function removeManagedServer(containerId, { removeData = false, serverName } = {}) {
    const removeResult = await dockerClient.removeContainer(containerId, true);
    if (!removeResult.success) {
      log.warn(`Failed to remove container ${containerId}: ${removeResult.error}`);
      return { success: false, error: removeResult.error };
    }
    if (removeData && serverName) {
      const volResult = await volumeManager.removeServerVolume(serverName);
      if (!volResult.success) {
        log.warn(`Container removed but server volume cleanup failed: ${volResult.error}`);
        return { success: true, volumeError: volResult.error };
      }
      log.info(`Removed server data volume for "${serverName}"`);
    }
    return { success: true };
  }

  return { buildContainerSpec, findAvailablePorts, createManagedServer, removeManagedServer };
}
