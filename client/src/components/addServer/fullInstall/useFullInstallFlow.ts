import { useState, useMemo } from "react";
import { useSteamCmdStep } from "./useSteamCmdStep";
import { useInstallConfigStep } from "./useInstallConfigStep";
import { usePerformanceStep } from "./usePerformanceStep";
import { useInstallProcess } from "./useInstallProcess";

const STEP_COUNT = 4;

interface UseFullInstallFlowOptions {
  onServerCreated: (serverId: string | number) => void;
  initialBranch?: string;
  initialInstallPath?: string;
}

// Composes the four per-step hooks into the single state/handler surface
// FullInstallFlow.tsx renders. Each step's state lives in its own hook;
// this hook only wires cross-step concerns (validation, install payload,
// folder browser dialog, step navigation).
export function useFullInstallFlow({ onServerCreated, initialBranch, initialInstallPath }: UseFullInstallFlowOptions) {
  const [currentStep, setCurrentStep] = useState(1);

  const steamCmd = useSteamCmdStep();
  const config = useInstallConfigStep(steamCmd.hasSteamCmd, steamCmd.steamCmdPath, initialBranch, initialInstallPath);
  const performance = usePerformanceStep();

  const process = useInstallProcess(
    {
      serverName: config.serverName,
      installPath: config.installPath,
      zomboidDataPath: config.zomboidDataPath,
      useCustomDataPath: config.useCustomDataPath,
      rconPort: performance.rconPort,
      rconPassword: performance.rconPassword,
      serverPort: performance.serverPort,
      minMemory: performance.minMemory,
      maxMemory: performance.maxMemory,
      useNoSteam: performance.useNoSteam,
      useDebug: performance.useDebug,
    },
    onServerCreated,
  );

  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseSetter, setBrowseSetter] = useState<{
    fn: (path: string) => void;
    title: string;
    initial?: string;
  } | null>(null);

  const handleBrowseFolder = (
    setter: (path: string) => void,
    description: string,
    currentPath?: string,
  ) => {
    setBrowseSetter({ fn: setter, title: description, initial: currentPath });
    setBrowseOpen(true);
  };

  const stepValidation = useMemo(
    () => ({
      1: steamCmd.steamCmdPath.length > 0 && steamCmd.hasSteamCmd,
      2: config.installPath.length > 0 && config.serverName.length > 0,
      3: performance.rconPassword.length >= 6,
      4: true,
    }),
    [
      steamCmd.steamCmdPath,
      steamCmd.hasSteamCmd,
      config.installPath,
      config.serverName,
      performance.rconPassword,
    ],
  );
  const canProceed = stepValidation[currentStep as keyof typeof stepValidation];

  const getStepRequirementMessage = () => {
    if (currentStep === 1) {
      if (!steamCmd.steamCmdPath.trim()) return "Set a SteamCMD folder path to continue.";
      if (!steamCmd.hasSteamCmd) return "Install or confirm SteamCMD to continue.";
    }
    if (currentStep === 2) {
      if (!config.installPath.trim() && !config.serverName.trim())
        return "Set an install folder and server name to continue.";
      if (!config.installPath.trim()) return "Set an install folder to continue.";
      if (!config.serverName.trim()) return "Enter a server name to continue.";
    }
    if (currentStep === 3 && performance.rconPassword.length < 6)
      return "RCON password must be at least 6 characters.";
    return "";
  };

  const handleInstall = () =>
    process.handleInstall({
      steamcmdPath: steamCmd.steamCmdPath,
      installPath: config.installPath,
      serverName: config.serverName,
      branch: config.branch,
      zomboidDataPath: config.useCustomDataPath ? config.zomboidDataPath : null,
      minMemory: performance.minMemory,
      maxMemory: performance.maxMemory,
      adminPassword: performance.adminPassword || null,
      serverPort: performance.serverPort,
      useUpnp: performance.useUpnp,
      useNoSteam: performance.useNoSteam,
      useDebug: performance.useDebug,
      rconPassword: performance.rconPassword,
      rconPort: performance.rconPort,
    });

  return {
    stepCount: STEP_COUNT,
    currentStep,
    setCurrentStep,
    stepValidation,
    canProceed,
    getStepRequirementMessage,

    steamCmd,
    config,
    performance,
    process,
    handleInstall,

    browseOpen,
    setBrowseOpen,
    browseSetter,
    handleBrowseFolder,
  };
}
