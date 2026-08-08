// The success-path body of the /install route's SteamCMD "close" handler:
// persists settings, re-verifies the data folder is writable, pre-creates
// the RCON ini, writes startup scripts, installs the PanelBridge mod, and
// emits the "install:complete" event. Extracted verbatim (same order, same
// awaits, same emitted payloads) so install.js stays under the file size
// limit.
import { createLogger } from "../../utils/logger.js";
import { setSetting, logServerEvent } from "../../database/init.js";
import { ensureWritableDirectory } from "./shared.js";
import { generateStartupScripts, writeStartupScriptFiles } from "./startupScripts.js";
import { precreateRconIni, installPanelBridgeMod } from "./installHelpers.js";

const log = createLogger("API:Server");

export async function completeSuccessfulInstall(ctx) {
  const {
    io,
    installPath,
    serverName,
    selectedBranch,
    zomboidDataPath,
    zomboidPath,
    usesEnvironmentDataPath,
    serverConfigPath,
    minMemory,
    maxMemory,
    serverPort,
    useUpnp,
    rconPassword,
    rconPort,
    safeRconPort,
    safeMinMemory,
    safeMaxMemory,
    safeServerPort,
    safeAdminPassword,
    useNoSteam,
    useDebug,
  } = ctx;

  log.info("PZ server installation completed successfully");

  // Auto-update settings with new paths
  await setSetting("serverPath", installPath);
  await setSetting("serverName", serverName);
  await setSetting("minMemory", minMemory);
  await setSetting("maxMemory", maxMemory);
  await setSetting("serverPort", serverPort);
  await setSetting("useUpnp", useUpnp);

  if (zomboidDataPath) {
    await setSetting("zomboidDataPath", zomboidDataPath);
  } else {
    await setSetting("zomboidDataPath", zomboidPath);
    io.emit("install:log", {
      type: "stdout",
      text: `Using ${usesEnvironmentDataPath ? "configured" : "isolated"} data folder: ${zomboidPath}`,
    });
  }

  await setSetting("serverConfigPath", serverConfigPath);

  // Re-check after the download in case a mounted path changed while
  // SteamCMD was running.
  try {
    ensureWritableDirectory(serverConfigPath);
  } catch (dirError) {
    log.error(
      `Data folder is not writable: ${zomboidPath} (${dirError.message})`,
    );
    io.emit("install:complete", {
      success: false,
      message:
        `Server files installed, but the data folder is not writable: ${zomboidPath} (${dirError.code || dirError.message}). ` +
        `Create it with the correct owner before starting the server, e.g. on Linux: ` +
        `sudo install -d -m 0755 -o "$(whoami)" -g "$(whoami)" "${zomboidPath}", then retry.`,
      installPath,
      serverName,
    });
    return;
  }

  // Save RCON settings for later use
  if (rconPassword) {
    await setSetting("rconPassword", rconPassword);
    await setSetting("rconPort", rconPort);
    await setSetting("rconHost", "127.0.0.1");
    io.emit("install:log", {
      type: "stdout",
      text: `RCON settings saved (port: ${rconPort})`,
    });

    if (precreateRconIni(serverConfigPath, serverName, rconPassword, safeRconPort)) {
      io.emit("install:log", {
        type: "stdout",
        text: "Pre-created server INI with RCON credentials",
      });
    }
  }

  // Generate custom startup scripts (both .bat and .sh)
  try {
    const scripts = generateStartupScripts({
      installPath,
      serverName,
      minMemory: safeMinMemory,
      maxMemory: safeMaxMemory,
      zomboidDataPath: zomboidPath,
      adminPassword: safeAdminPassword,
      serverPort: safeServerPort,
      useNoSteam,
      useDebug,
    });

    const { batchPath, shellPath } = writeStartupScriptFiles(
      installPath,
      serverName,
      scripts,
    );
    log.info(`Created custom startup batch: ${batchPath}`);
    log.info(`Created custom startup script: ${shellPath}`);

    const scriptName =
      process.platform === "win32"
        ? `StartServer_${serverName}.bat`
        : `start-server_${serverName}.sh`;
    io.emit("install:log", {
      type: "stdout",
      text: `Created custom startup script: ${scriptName}`,
    });
  } catch (batchError) {
    log.warn(`Failed to create startup scripts: ${batchError.message}`);
  }

  logServerEvent(
    "server_install",
    `Installed PZ server to ${installPath} (${selectedBranch} branch)`,
  );

  // Auto-install PanelBridge mod to the server
  if (installPanelBridgeMod(installPath)) {
    io.emit("install:log", {
      type: "stdout",
      text: "PanelBridge mod installed automatically",
    });
  }

  io.emit("install:complete", {
    success: true,
    message: "Server installed successfully",
    installPath,
    serverName,
    zomboidDataPath: zomboidPath, // Send back the computed data path
    serverConfigPath,
    branch: selectedBranch,
    rconPort: safeRconPort,
    hasRconPassword: !!rconPassword,
    serverPort: safeServerPort,
    minMemory: safeMinMemory,
    maxMemory: safeMaxMemory,
  });
}
