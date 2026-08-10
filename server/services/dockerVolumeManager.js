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

  async function listManagedVolumes() {
    const baseInfo = await dockerClient.inspectVolume(BASE_VOLUME);
    const base = baseInfo ? { name: baseInfo.Name, mountpoint: baseInfo.Mountpoint } : null;
    // Docker doesn't support prefix filtering on volumes, so we list managed
    // containers and check their bound volumes instead. For now, return the
    // base volume info. Per-server volume listing will be added when we have
    // a server registry that tracks volume names.
    return { base, servers: [] };
  }

  return { getBaseVolumeStatus, ensureBaseVolume, createServerVolume, removeServerVolume, listManagedVolumes };
}
