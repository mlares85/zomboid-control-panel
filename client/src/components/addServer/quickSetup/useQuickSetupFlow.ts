import { useState, useMemo } from "react";
import { useQuickConfigStep } from "./useQuickConfigStep";
import { useQuickSetupProcess } from "./useQuickSetupProcess";

const STEP_COUNT = 3;

interface UseQuickSetupFlowOptions {
  onServerCreated: (serverId: string | number) => void;
  initialInstallPath?: string;
}

// Composes the config + process hooks into the single state/handler surface
// QuickSetupFlow.tsx renders. Mirrors useFullInstallFlow's composition.
export function useQuickSetupFlow({ onServerCreated, initialInstallPath }: UseQuickSetupFlowOptions) {
  const [currentStep, setCurrentStep] = useState(1);

  const config = useQuickConfigStep({ initialInstallPath });
  const process = useQuickSetupProcess(onServerCreated);

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
      1: config.installPath.length > 0,
      2: config.serverName.length > 0 && config.rconPassword.length >= 6,
      3: true,
    }),
    [config.installPath, config.serverName, config.rconPassword],
  );
  const canProceed = stepValidation[currentStep as keyof typeof stepValidation];

  const getStepRequirementMessage = () => {
    if (currentStep === 1) return "Select the dedicated server folder to continue.";
    if (currentStep === 2) {
      if (!config.serverName.trim() && config.rconPassword.length < 6)
        return "Enter a server name and an RCON password (minimum 6 characters).";
      if (!config.serverName.trim()) return "Enter a server name to continue.";
      if (config.rconPassword.length < 6)
        return "RCON password must be at least 6 characters.";
    }
    return "";
  };

  const handleCreate = () =>
    process.handleQuickSetup({
      installPath: config.installPath,
      serverName: config.serverName,
      zomboidDataPath: config.zomboidDataPath,
      useCustomDataPath: config.useCustomDataPath,
      rconPort: config.rconPort,
      rconPassword: config.rconPassword,
      serverPort: config.serverPort,
      minMemory: config.minMemory,
      maxMemory: config.maxMemory,
      adminPassword: config.adminPassword,
      useUpnp: config.useUpnp,
      useNoSteam: config.useNoSteam,
      useDebug: config.useDebug,
    });

  return {
    stepCount: STEP_COUNT,
    currentStep,
    setCurrentStep,
    stepValidation,
    canProceed,
    getStepRequirementMessage,

    config,
    process,
    handleCreate,

    browseOpen,
    setBrowseOpen,
    browseSetter,
    handleBrowseFolder,
  };
}
