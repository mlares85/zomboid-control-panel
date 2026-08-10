import { createLogger } from "../utils/logger.js";

const log = createLogger("BaseVolumePopulator");

const BASE_VOLUME = "zomboid-panel-base";

const STEAMCMD_SPEC = {
  Image: "steamcmd/steamcmd:latest",
  Cmd: ["+force_install_dir", "/data", "+login", "anonymous", "+app_update", "380870", "validate", "+quit"],
  HostConfig: { Binds: [`${BASE_VOLUME}:/data`] },
  Labels: { "zomboid-panel.role": "steamcmd-populate" },
};

async function ensureBaseVolume(dockerClient) {
  const existing = await dockerClient.inspectVolume(BASE_VOLUME);
  if (existing) return;
  await dockerClient.createVolume(BASE_VOLUME);
}

function emitNewLogLines(logResult, lastLineCount, io) {
  if (!logResult.success || logResult.lines.length <= lastLineCount) return lastLineCount;
  const newLines = logResult.lines.slice(lastLineCount);
  for (const line of newLines) {
    io.emit("docker:populate-log", { type: "stdout", text: line });
  }
  return logResult.lines.length;
}

function pollContainerProgress(dockerClient, containerId, io, onComplete) {
  let lastLineCount = 0;
  const interval = setInterval(async () => {
    try {
      const info = await dockerClient.inspectContainer(containerId);
      const logResult = await dockerClient.getContainerLogs(containerId, 200);
      lastLineCount = emitNewLogLines(logResult, lastLineCount, io);
      if (!info?.State?.Running) {
        clearInterval(interval);
        const exitCode = info?.State?.ExitCode ?? -1;
        const success = exitCode === 0;
        io.emit("docker:populate-complete", {
          success,
          message: success ? "Base volume populated successfully" : `SteamCMD exited with code ${exitCode}`,
        });
        await dockerClient.removeContainer(containerId, true);
        onComplete(success);
      }
    } catch (err) {
      log.error(`Polling error for container ${containerId}: ${err.message}`);
    }
  }, 3000);
}

export async function startBaseVolumePopulation(dockerClient, io, onComplete) {
  await ensureBaseVolume(dockerClient);

  const pullResult = await dockerClient.pullImage("steamcmd/steamcmd", "latest");
  if (!pullResult.success) {
    return { success: false, error: `Failed to pull SteamCMD image: ${pullResult.error}` };
  }

  const createResult = await dockerClient.createContainer(STEAMCMD_SPEC, "zomboid-steamcmd-populate");
  if (!createResult.success) {
    return { success: false, error: `Failed to create container: ${createResult.error}` };
  }

  const startResult = await dockerClient.startContainer(createResult.id);
  if (!startResult.success) {
    await dockerClient.removeContainer(createResult.id, true);
    return { success: false, error: `Failed to start container: ${startResult.error}` };
  }

  pollContainerProgress(dockerClient, createResult.id, io, onComplete);
  return { success: true, message: "Base volume population started", containerId: createResult.id };
}
