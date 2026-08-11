import { createLogger } from "../utils/logger.js";

const log = createLogger("DockerVolumeManager");

const BASE_VOLUME = "zomboid-panel-base";
const SERVER_VOLUME_PREFIX = "zomboid-srv-";

export function serverVolumeName(serverName) {
  return `${SERVER_VOLUME_PREFIX}${serverName}`;
}

export function createDockerVolumeManager(dockerClient) {
  async function getBaseVolumeStatus() {
    const info = await dockerClient.inspectVolume(BASE_VOLUME);
    if (!info) return { exists: false, populated: false };
    return { exists: true, populated: true, mountpoint: info.Mountpoint };
  }

  async function ensureBaseVolume() {
    const status = await getBaseVolumeStatus();
    if (status.exists) return { success: true, created: false };
    const result = await dockerClient.createVolume(BASE_VOLUME);
    if (!result.success) {
      log.warn(`Failed to create base volume: ${result.error}`);
      return { success: false, created: false };
    }
    return { success: true, created: true };
  }

  async function createServerVolume(serverName) {
    const volumeName = serverVolumeName(serverName);
    const result = await dockerClient.createVolume(volumeName);
    if (!result.success) {
      log.warn(`Failed to create server volume ${volumeName}: ${result.error}`);
      return { success: false, volumeName };
    }
    return { success: true, volumeName };
  }

  async function removeServerVolume(serverName) {
    const volumeName = serverVolumeName(serverName);
    const result = await dockerClient.removeVolume(volumeName);
    if (!result.success) {
      log.warn(`Failed to remove volume ${volumeName}: ${result.error}`);
    }
    return result;
  }

  async function removeBaseVolume() {
    const result = await dockerClient.removeVolume(BASE_VOLUME);
    if (!result.success) {
      log.warn(`Failed to remove base volume: ${result.error}`);
    }
    return result;
  }

  async function listManagedVolumes() {
    const baseInfo = await dockerClient.inspectVolume(BASE_VOLUME);
    const base = baseInfo ? { name: baseInfo.Name, mountpoint: baseInfo.Mountpoint } : null;
    // List all volumes and filter for our prefix.
    const servers = [];
    const listResult = await dockerClient._requestJson("GET", "/volumes");
    if (listResult.success && Array.isArray(listResult.data?.Volumes)) {
      for (const v of listResult.data.Volumes) {
        if (v.Name?.startsWith(SERVER_VOLUME_PREFIX)) {
          servers.push({
            name: v.Name,
            serverName: v.Name.slice(SERVER_VOLUME_PREFIX.length),
            mountpoint: v.Mountpoint,
          });
        }
      }
    }
    return { base, servers };
  }

  return { getBaseVolumeStatus, ensureBaseVolume, createServerVolume, removeServerVolume, removeBaseVolume, listManagedVolumes };
}
