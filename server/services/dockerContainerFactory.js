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
  // isolation comes from separate data volumes (/root/Zomboid), not from
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
  // The "--" after the -c script ensures Docker's Cmd args land in $@
  // instead of $0/$1 (bash -c 'script' uses the next arg as $0).
  const PZ_ENTRYPOINT = [
    "/bin/bash", "-c",
    [
      // Install 32-bit compatibility libraries if not already present
      "if ! dpkg -s lib32gcc-s1 >/dev/null 2>&1; then",
      "  echo '[panel] Installing 32-bit compatibility libraries...';",
      "  dpkg --add-architecture i386;",
      "  apt-get update -qq;",
      "  apt-get install -y --no-install-recommends lib32gcc-s1 libstdc++6:i386 ca-certificates libssl3 unzip >/dev/null 2>&1;",
      "  rm -rf /var/lib/apt/lists/*;",
      "  echo '[panel] 32-bit libraries installed.';",
      "fi;",
      // PZ's SQLite JDBC looks for libsqlitejdbc.so in java.library.path
      // (set to linux64/ by ProjectZomboid64.json). The .so is bundled
      // inside projectzomboid.jar but the JNI-launched JVM can't extract
      // it at runtime. Pre-extract it so PZ finds it on the filesystem.
      "if [ ! -f /opt/pz-server/linux64/libsqlitejdbc.so ]; then",
      "  echo '[panel] Extracting SQLite native lib from JAR...';",
      "  cd /tmp && unzip -o /opt/pz-server/java/projectzomboid.jar org/sqlite/native/Linux/x86_64/libsqlitejdbc.so >/dev/null 2>&1;",
      "  if [ -f org/sqlite/native/Linux/x86_64/libsqlitejdbc.so ]; then",
      "    cp org/sqlite/native/Linux/x86_64/libsqlitejdbc.so /opt/pz-server/linux64/libsqlitejdbc.so;",
      "    rm -rf org/;",
      "    echo '[panel] SQLite native lib extracted.';",
      "  else echo '[panel] SQLite extraction failed — server may not start.'; fi;",
      "fi;",
      // No symlink needed — the data volume mounts directly at /root/Zomboid
      // (where PZ writes saves/configs when running as root).
      // Pre-seed RCON config in the server INI. PZ enables RCON when
      // RCONPassword is non-empty (there is no RCONEnabled key — it's
      // implicit). PZ preserves existing key values when it inflates a
      // stub INI into its full ~420-line default on first boot.
      "SRV_NAME='servertest';",
      "for arg in \"$@\"; do",
      "  if [ \"$prev\" = '-servername' ]; then SRV_NAME=\"$arg\"; fi;",
      "  prev=\"$arg\";",
      "done;",
      "INI_DIR=\"/root/Zomboid/Server\";",
      "INI_FILE=\"${INI_DIR}/${SRV_NAME}.ini\";",
      "mkdir -p \"$INI_DIR\";",
      // First boot: create a stub INI with RCON keys. PZ inflates it,
      // preserving these values. Subsequent boots: ensure password matches
      // (in case it was changed via env var).
      "if [ ! -f \"$INI_FILE\" ] && [ -n \"$RCON_PASSWORD\" ]; then",
      "  echo \"[panel] Pre-seeding RCON config at $INI_FILE\";",
      "  printf 'RCONPort=%s\\nRCONPassword=%s\\n' \"${RCON_PORT:-27015}\" \"$RCON_PASSWORD\" > \"$INI_FILE\";",
      "elif [ -f \"$INI_FILE\" ] && [ -n \"$RCON_PASSWORD\" ]; then",
      "  if ! grep -q \"^RCONPassword=$RCON_PASSWORD\" \"$INI_FILE\"; then",
      "    echo '[panel] Updating RCON password in server INI';",
      "    sed -i \"s/^RCONPassword=.*/RCONPassword=$RCON_PASSWORD/\" \"$INI_FILE\";",
      "  fi;",
      "fi;",
      // Fix LD_LIBRARY_PATH for JRE 25 (lib/amd64 moved to lib/server)
      "export JAVA_HOME=/opt/pz-server/jre64;",
      "export LD_LIBRARY_PATH=/opt/pz-server/linux64:/opt/pz-server:${JAVA_HOME}/lib/server:${JAVA_HOME}/lib:${LD_LIBRARY_PATH:-};",
      // Run the PZ start script
      'exec /opt/pz-server/start-server.sh "$@"',
    ].join(" "),
    "--",
  ];

  function buildContainerSpec(config) {
    const image = config.image || DEFAULT_IMAGE;
    const gamePort = config.gamePort || BASE_GAME_PORT;
    const rconPort = config.rconPort || BASE_RCON_PORT;
    const restartPolicy = config.restartPolicy || "unless-stopped";

    const env = [
      // No HOME override needed — PZ running as root uses /root/Zomboid
      // for data (mounted as the persistent data volume).
      `RCON_PORT=${rconPort}`,
      `RCON_PASSWORD=${config.rconPassword}`,
      `GAME_PORT=${gamePort}`,
      `PZ_SERVER_ARGS=-Xms${config.minMemoryMb || 2048}m -Xmx${config.maxMemoryMb || 4096}m`,
      ...(config.adminPassword ? [`ADMIN_PASSWORD=${config.adminPassword}`] : []),
      ...(config.timezone ? [`TZ=${config.timezone}`] : []),
    ];

    const hostConfig = {
      Binds: [
        baseMount(config),
        // PZ running as root writes saves/configs to /root/Zomboid.
        // Mount the data volume there directly for persistence.
        `zomboid-srv-${config.serverName}:/root/Zomboid`,
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
      RestartPolicy: { Name: restartPolicy },
    };

    // Docker container-level resource limits (separate from JVM heap)
    if (config.dockerMemoryMb) hostConfig.Memory = config.dockerMemoryMb * 1024 * 1024;
    if (config.cpuLimit) hostConfig.NanoCpus = Math.round(config.cpuLimit * 1e9);

    return {
      Image: image,
      Entrypoint: PZ_ENTRYPOINT,
      Cmd: [
        "-servername", config.serverName,
        ...(config.adminPassword ? ["-adminpassword", config.adminPassword] : []),
      ],
      Env: env,
      Labels: {
        [MANAGED_LABEL]: "true",
        [SERVER_ID_LABEL]: config.serverName,
      },
      ExposedPorts: {
        [`${gamePort}/udp`]: {},
        [`${gamePort + 1}/udp`]: {},
        [`${rconPort}/tcp`]: {},
      },
      HostConfig: hostConfig,
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

  async function createManagedServer(config, onProgress = () => {}) {
    const preflightError = await preflightBaseCheck(config);
    if (preflightError) {
      return { success: false, error: preflightError };
    }

    onProgress("creating-volumes", "Creating storage volumes…");
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
      onProgress("pulling-image", `Pulling image ${imageRef}…`);
      const pullResult = await dockerClient.pullImage(imageRef);
      if (!pullResult.success) {
        return { success: false, error: `Image pull failed: ${pullResult.error}` };
      }
    } else {
      onProgress("pulling-image", `Image ${imageRef} ready`);
    }

    onProgress("creating-container", "Setting up network and creating container…");
    await ensureNetwork();
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
