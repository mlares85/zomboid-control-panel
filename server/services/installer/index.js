/**
 * Installer module — re-exports and factory for creating installer instances.
 */
export { Installer } from "./Installer.js";
export { NativeSteamCmdInstaller } from "./NativeSteamCmdInstaller.js";
export { ContainerSteamCmdInstaller } from "./ContainerSteamCmdInstaller.js";
export { detectSetupEnvironment, detectSteamCmd, detectPzInstalls } from "./detectInstall.js";

import { NativeSteamCmdInstaller } from "./NativeSteamCmdInstaller.js";
import {
  getSteamCmdExe,
  ensureSteamCmdLinux,
  hasActiveSteamOperation,
  activeSteamOperations,
  getBetaArgs,
  getSteamLoginArgs,
  attachSteamCmdLineStreaming,
  recoverMismatchedSteamBranchManifest,
} from "../../routes/server/steamcmd.js";

let _nativeInstaller;

/**
 * Get or create the shared NativeSteamCmdInstaller instance.
 * Wired to the real SteamCMD helpers from routes/server/steamcmd.js.
 */
export function getNativeInstaller() {
  if (!_nativeInstaller) {
    _nativeInstaller = new NativeSteamCmdInstaller({
      steamCmd: {
        getExe: getSteamCmdExe,
        ensureLinux: ensureSteamCmdLinux,
        hasActiveOp: hasActiveSteamOperation,
        activeOps: activeSteamOperations,
        getBetaArgs,
        getLoginArgs: getSteamLoginArgs,
        attachStreaming: attachSteamCmdLineStreaming,
        recoverManifest: recoverMismatchedSteamBranchManifest,
      },
    });
  }
  return _nativeInstaller;
}
