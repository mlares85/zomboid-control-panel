import { createLogger } from "../utils/logger.js";

const log = createLogger("DockerContainerFactory");

// PZ bundles its own JRE (jre64/) — no image-provided Java needed.
// Debian Bullseye provides glibc + the base libs PZ expects. Using a
// JRE image (e.g. eclipse-temurin) puts a different Java on PATH that
// conflicts with PZ's bundled JRE and native library loading.
// Debian Bookworm provides GLIBCXX_3.4.29+ required by PZ Build 42.
// PZ bundles its own JRE — no image-provided Java needed.
const DEFAULT_IMAGE = "debian:bookworm-slim";
const BASE_GAME_PORT = 16261;
const BASE_RCON_PORT = 27015;
const MANAGED_LABEL = "zomboid-panel.managed";
const SERVER_ID_LABEL = "zomboid-panel.server-id";
const PANEL_NETWORK = "zomboid-panel-net";

export function createDockerContainerFactory(dockerClient, volumeManager) {
  // Bind-mounts an existing host directory or the shared named volume.
  // Not read-only: PZ writes temp files, logs, and extracts native libs
  // (SQLite JNI) into its install directory at runtime. Multi-server
  // isolation comes from separate data volumes (/opt/pz-data), not from
  // protecting the base — PZ's runtime writes are ephemeral.
  function baseMount(config) {
    if (config.basePath) return `${config.basePath}:/opt/pz-server`;
    return "zomboid-panel-base:/opt/pz-server";
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

  // Connect the panel's own container to the managed network so Docker DNS
  // resolves managed container names for RCON. Best-effort — if the panel
  // runs on the host (not in Docker), the connect call fails harmlessly.
  async function connectPanelToNetwork() {
    for (const name of ["zomboid-panel", "zomboid-control-panel"]) {
      const info = await dockerClient.inspectContainer(name);
      if (!info) continue;
      const nets = info.NetworkSettings?.Networks || {};
      if (nets[PANEL_NETWORK]) return; // already connected
      const result = await dockerClient._requestJson(
        "POST", `/networks/${PANEL_NETWORK}/connect`, { Container: info.Id },
      );
      if (result.success) log.info(`Connected panel container to ${PANEL_NETWORK}`);
      else log.warn(`Failed to connect panel to ${PANEL_NETWORK}: ${result.error}`);
      return;
    }
  }

  // Validate the base volume/path has a PZ start script before creating.
  // containerBasePath is the path visible inside the panel container (e.g.
  // /pz-server); basePath may already be resolved to a host path for the
  // Docker bind mount. We check whichever is reachable from this process.
  async function preflightBaseCheck(config) {
    if (config.basePath) {
      const { existsSync } = await import("fs");
      const { join } = await import("path");
      const checkPath = config.containerBasePath || config.basePath;
      if (!existsSync(join(checkPath, "start-server.sh"))) {
        return "start-server.sh not found in base path — PZ server files may not be installed";
      }
    }
    // For volume mode we can't easily check inside a volume without
    // running a container, so skip — the container will fail to start
    // and the error will be visible in logs.
    return null;
  }

  // PZ's native libraries need 32-bit compat libs (lib32gcc-s1, libstdc++6).
  // The default eclipse-temurin:21-jre image doesn't include them, so we wrap
  // the start script in an inline entrypoint that installs them on first boot.
  // Subsequent starts skip the install (dpkg -s check) so there's no penalty.
  const PZ_ENTRYPOINT = [
    "/bin/bash", "-c",
    [
      // Install 32-bit compatibility libraries if not already present
      "if ! dpkg -s lib32gcc-s1 >/dev/null 2>&1; then",
      "  echo '[panel] Installing 32-bit compatibility libraries...';",
      "  dpkg --add-architecture i386;",
      "  apt-get update -qq;",
      "  apt-get install -y --no-install-recommends lib32gcc-s1 libstdc++6:i386 ca-certificates libssl3 >/dev/null 2>&1;",
      "  rm -rf /var/lib/apt/lists/*;",
      "  echo '[panel] 32-bit libraries installed.';",
      "fi;",
      // PZ's start-server.sh sets LD_LIBRARY_PATH to jre64/lib/amd64 which
      // doesn't exist in JRE 25 (moved to jre64/lib + jre64/lib/server).
      // Pre-set the correct paths so the JVM finds libjsig.so, libjvm.so,
      // and SQLite's native lib extraction works.
      "export JAVA_HOME=/opt/pz-server/jre64;",
      "export LD_LIBRARY_PATH=/opt/pz-server/linux64:/opt/pz-server/natives:/opt/pz-server:${JAVA_HOME}/lib/server:${JAVA_HOME}/lib:${LD_LIBRARY_PATH:-};",
      // Run the PZ start script
      'exec /opt/pz-server/start-server.sh "$@"',
    ].join(" "),
  ];

  function buildContainerSpec(config) {
    const image = config.image || DEFAULT_IMAGE;
    const gamePort = config.gamePort || BASE_GAME_PORT;
    const rconPort = config.rconPort || BASE_RCON_PORT;
    return {
      Image: image,
      Entrypoint: PZ_ENTRYPOINT,
      Cmd: ["-servername", config.serverName],
      Env: [
        // HOME must point at the install dir so PZ's SQLite JDBC loader
        // can extract native libs to a writable location relative to CWD.
        // PZ's -cachedir arg directs saves/configs to the data volume.
        `HOME=/opt/pz-server`,
        `RCON_PORT=${rconPort}`,
        `RCON_PASSWORD=${config.rconPassword}`,
        `GAME_PORT=${gamePort}`,
        `PZ_SERVER_ARGS=-Xms${config.minMemoryMb || 2048}m -Xmx${config.maxMemoryMb || 4096}m`,
        ...(config.adminPassword ? [`ADMIN_PASSWORD=${config.adminPassword}`] : []),
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
        // Tmpfs mount for /tmp — PZ writes temp files during saves and
        // some Docker runtimes mount / as read-only or noexec.
        Tmpfs: { "/tmp": "" },
        NetworkMode: PANEL_NETWORK,
        RestartPolicy: { Name: "unless-stopped" },
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
    // Gap 6: preflight check — validate base has PZ server files
    const preflightError = await preflightBaseCheck(config);
    if (preflightError) {
      return { success: false, error: preflightError };
    }

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
    // Gap 2: connect panel container to the managed network so Docker DNS
    // resolves the managed container name for RCON.
    await connectPanelToNetwork();
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
