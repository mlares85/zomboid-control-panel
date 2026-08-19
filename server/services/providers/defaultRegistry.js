import { ProviderRegistry } from "./ProviderRegistry.js";
import { LocalFiles } from "../fileAccess/LocalFiles.js";
import { DockerLifecycle } from "../lifecycle/DockerLifecycle.js";
import { NativeLifecycle } from "../lifecycle/NativeLifecycle.js";
import { ContainerSteamCmdInstaller } from "../installer/ContainerSteamCmdInstaller.js";
// Note: SftpMirrorFiles is not imported here because it requires
// session management — it will be wired when the SFTP provider is
// fully integrated. For now, remote-sftp returns null for files.

/**
 * Builds the default static registry for all known provider types.
 * @returns {ProviderRegistry}
 */
export function createDefaultRegistry() {
  const registry = new ProviderRegistry();

  registry.register("native", {
    label: "Native (local process)",
    capabilities: ["lifecycle", "files", "installer"],
    create: (deps, _cfg) => ({
      lifecycle: new NativeLifecycle(),
      files: new LocalFiles(),
      installer: deps.nativeInstaller || null,
    }),
  });

  registry.register("docker-local", {
    label: "Docker (external container)",
    capabilities: ["files"],
    create: (_deps, _cfg) => ({
      lifecycle: null,
      files: new LocalFiles(),
      installer: null,
    }),
  });

  registry.register("docker-managed", {
    label: "Docker (panel-managed container)",
    capabilities: ["lifecycle", "files", "installer"],
    create: (deps, cfg) => ({
      lifecycle: deps.dockerClient
        ? new DockerLifecycle({
          dockerClient: deps.dockerClient,
          containerRef: cfg.dockerContainerId || cfg.dockerContainerName,
        })
        : null,
      files: new LocalFiles(),
      installer: deps.dockerClient
        ? new ContainerSteamCmdInstaller({ dockerClient: deps.dockerClient })
        : null,
    }),
  });

  registry.register("remote-sftp", {
    label: "Remote (SFTP)",
    capabilities: [],
    create: (_deps, _cfg) => ({
      lifecycle: null,
      files: null, // SftpMirrorFiles requires session setup — wired separately
      installer: null,
    }),
  });

  return registry;
}
