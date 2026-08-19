/**
 * ContainerSteamCmdInstaller — installs/updates PZ server files into a
 * Docker volume by running a temporary SteamCMD container.
 *
 * Wraps the existing baseVolumePopulator.js logic behind the Installer
 * interface so both native and containerized installs share the same
 * contract and are testable the same way.
 */
import { Installer } from "./Installer.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("ContainerSteamCmdInstaller");

const STEAMCMD_IMAGE = "steamcmd/steamcmd";
const STEAMCMD_TAG = "latest";
const PZ_APP_ID = "380870";
const POLL_INTERVAL_MS = 3000;

export class ContainerSteamCmdInstaller extends Installer {
  /**
   * @param {object} deps
   * @param {object} deps.dockerClient - DockerClient instance
   */
  constructor(deps) {
    super("ContainerSteamCmdInstaller");
    this._docker = deps.dockerClient;
  }

  async isAvailable() {
    if (!this._docker) {
      return { available: false, reason: "Docker client not configured" };
    }
    try {
      const info = await this._docker.info();
      if (!info) {
        return { available: false, reason: "Docker daemon not responding" };
      }
      return { available: true };
    } catch (err) {
      return { available: false, reason: `Docker unavailable: ${err.message}` };
    }
  }

  async install({ volumeName, branch = "public", onProgress }) {
    return this._populate({ volumeName, branch, onProgress });
  }

  async update({ volumeName, branch = "public", onProgress }) {
    // Update is the same operation — SteamCMD validate re-downloads changed files
    return this._populate({ volumeName, branch, onProgress });
  }

  // ── Private ─────────────────────────────────────────────────────────

  async _populate({ volumeName, branch, onProgress }) {
    const emit = makeEmitter(onProgress);

    if (!this._docker) {
      return { success: false, error: "Docker client not configured" };
    }

    // Ensure volume exists
    emit("status", { status: "preparing", message: "Ensuring volume exists..." });
    try {
      const existing = await this._docker.inspectVolume(volumeName);
      if (!existing) {
        await this._docker.createVolume(volumeName);
      }
    } catch (err) {
      return { success: false, error: `Volume setup failed: ${err.message}` };
    }

    // Pull SteamCMD image
    emit("status", { status: "pulling", message: "Pulling SteamCMD image..." });
    const pullResult = await this._docker.pullImage(STEAMCMD_IMAGE, STEAMCMD_TAG);
    if (!pullResult.success) {
      return { success: false, error: `Failed to pull SteamCMD image: ${pullResult.error}` };
    }

    // Build container spec
    const betaArgs = buildBetaArgs(branch);
    const containerSpec = {
      Image: `${STEAMCMD_IMAGE}:${STEAMCMD_TAG}`,
      Cmd: [
        "+force_install_dir", "/data",
        "+login", "anonymous",
        "+app_update", PZ_APP_ID,
        ...betaArgs,
        "validate",
        "+quit",
      ],
      HostConfig: { Binds: [`${volumeName}:/data`] },
      Labels: { "zomboid-panel.role": "steamcmd-populate" },
    };

    // Create and start the container
    emit("status", { status: "starting", message: "Starting SteamCMD container..." });
    const createResult = await this._docker.createContainer(
      containerSpec,
      "zomboid-steamcmd-populate",
    );
    if (!createResult.success) {
      return { success: false, error: `Failed to create container: ${createResult.error}` };
    }

    const containerId = createResult.id;
    const startResult = await this._docker.startContainer(containerId);
    if (!startResult.success) {
      await this._docker.removeContainer(containerId, true);
      return { success: false, error: `Failed to start container: ${startResult.error}` };
    }

    emit("start", {
      type: "install",
      message: "SteamCMD container started, downloading PZ server files...",
      containerId,
    });

    // Poll for completion
    return this._pollUntilDone(containerId, emit);
  }

  async _pollUntilDone(containerId, emit) {
    let lastLineCount = 0;

    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        try {
          const info = await this._docker.inspectContainer(containerId);
          const logResult = await this._docker.getContainerLogs(containerId, 200);

          // Emit new log lines
          if (logResult.success && logResult.lines.length > lastLineCount) {
            const newLines = logResult.lines.slice(lastLineCount);
            for (const line of newLines) {
              emit("log", { type: "stdout", text: line });
            }
            lastLineCount = logResult.lines.length;
          }

          // Check if container finished
          if (!info?.State?.Running) {
            clearInterval(interval);
            const exitCode = info?.State?.ExitCode ?? -1;
            const success = exitCode === 0;

            emit("complete", {
              success,
              message: success
                ? "Base volume populated successfully"
                : `SteamCMD exited with code ${exitCode}`,
            });

            // Clean up container
            await this._docker.removeContainer(containerId, true);
            resolve({
              success,
              error: success ? undefined : `SteamCMD exited with code ${exitCode}`,
            });
          }
        } catch (err) {
          log.error(`Polling error for container ${containerId}: ${err.message}`);
        }
      }, POLL_INTERVAL_MS);
    });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function makeEmitter(onProgress) {
  return (event, data) => {
    try { onProgress?.(event, data); } catch { /* best effort */ }
  };
}

function buildBetaArgs(branch) {
  if (!branch || branch === "public" || branch === "stable") return [];
  return ["-beta", branch];
}
