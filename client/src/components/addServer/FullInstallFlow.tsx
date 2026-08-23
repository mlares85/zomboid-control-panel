import {
  Download,
  Server,
  CheckCircle,
  Settings2,
  Zap,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FolderBrowser } from "@/components/FolderBrowser";
import { SteamCmdStep } from "@/components/addServer/fullInstall/SteamCmdStep";
import { InstallConfigStep } from "@/components/addServer/fullInstall/InstallConfigStep";
import { PerformanceStep } from "@/components/addServer/fullInstall/PerformanceStep";
import { ReviewStep } from "@/components/addServer/fullInstall/ReviewStep";
import { useFullInstallFlow } from "@/components/addServer/fullInstall/useFullInstallFlow";

export type { InstallLog } from "@/components/addServer/fullInstall/types";

interface FullInstallFlowProps {
  onServerCreated: (serverId: string | number) => void;
  onBack: () => void;
  initialBranch?: string;
  initialInstallPath?: string;
}

const STEPS = [
  { id: 1, label: "SteamCMD", icon: Download },
  { id: 2, label: "Server", icon: Server },
  { id: 3, label: "Settings", icon: Settings2 },
  { id: 4, label: "Install", icon: Zap },
];

// Shell for the 4-step "Fresh Install" (SteamCMD) server setup flow.
// All state/effects/handlers live in useFullInstallFlow + its per-step hooks;
// this component only wires props and renders the current step.
export function FullInstallFlow({ onServerCreated, onBack, initialBranch, initialInstallPath }: FullInstallFlowProps) {
  const flow = useFullInstallFlow({ onServerCreated, initialBranch, initialInstallPath });
  const { steamCmd, config, performance, process, currentStep, setCurrentStep, stepValidation } = flow;

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <SteamCmdStep
            path={steamCmd.steamCmdPath}
            onPathChange={steamCmd.setSteamCmdPath}
            hasSteamCmd={steamCmd.hasSteamCmd}
            onChangePath={() => steamCmd.setHasSteamCmd(false)}
            downloading={steamCmd.downloadingSteamCmd}
            status={steamCmd.steamCmdStatus}
            onAutoDownload={steamCmd.handleDownloadSteamCmd}
            onSaveManualPath={steamCmd.handleSaveSteamCmdPath}
            onAutoDetect={steamCmd.handleAutoDetectSteamCmd}
            onBrowseFolder={flow.handleBrowseFolder}
          />
        );
      case 2:
        return (
          <InstallConfigStep
            installPath={config.installPath}
            onInstallPathChange={config.setInstallPath}
            serverName={config.serverName}
            onServerNameChange={config.setServerName}
            branch={config.branch}
            onBranchChange={config.setBranch}
            availableBranches={config.availableBranches}
            loadingBranches={config.loadingBranches}
            dataPath={{
              enabled: config.useCustomDataPath,
              onEnabledChange: config.setUseCustomDataPath,
              value: config.zomboidDataPath,
              onValueChange: config.setZomboidDataPath,
            }}
            onBrowseFolder={flow.handleBrowseFolder}
          />
        );
      case 3:
        return (
          <PerformanceStep
            rcon={{
              password: performance.rconPassword,
              onPasswordChange: performance.setRconPassword,
              port: performance.rconPort,
              onPortChange: performance.setRconPort,
              visible: performance.showRconPassword,
              onToggleVisible: () => performance.setShowRconPassword((v) => !v),
              copied: performance.copiedPassword,
              onCopy: performance.handleCopyPassword,
              onRegenerate: performance.handleRegeneratePassword,
            }}
            memory={{
              min: performance.minMemory,
              max: performance.maxMemory,
              onMinChange: performance.setMinMemory,
              onMaxChange: performance.setMaxMemory,
              systemRam: performance.systemRam,
              detecting: performance.detectingRam,
            }}
            advanced={{
              serverPort: performance.serverPort,
              onServerPortChange: performance.setServerPort,
              adminPassword: performance.adminPassword,
              onAdminPasswordChange: performance.setAdminPassword,
              adminPasswordVisible: performance.showAdminPassword,
              onToggleAdminPasswordVisible: () => performance.setShowAdminPassword((v) => !v),
              useUpnp: performance.useUpnp,
              onUseUpnpChange: performance.setUseUpnp,
              useNoSteam: performance.useNoSteam,
              onUseNoSteamChange: performance.setUseNoSteam,
              useDebug: performance.useDebug,
              onUseDebugChange: performance.setUseDebug,
            }}
          />
        );
      case 4:
        return (
          <ReviewStep
            summary={{
              installPath: config.installPath,
              serverName: config.serverName,
              branch: config.branch,
              minMemory: performance.minMemory,
              maxMemory: performance.maxMemory,
              serverPort: performance.serverPort,
              rconPort: performance.rconPort,
            }}
            installing={process.installing}
            installComplete={process.installComplete}
            missingAdminPassword={performance.missingAdminPassword}
            installProgress={process.installProgress}
            logs={process.logs}
            logsEndRef={process.logsEndRef}
            onInstall={flow.handleInstall}
          />
        );
    }
  };

  const isLastStep = currentStep === flow.stepCount;

  return (
    <>
      <div className="max-w-3xl mx-auto space-y-6 page-transition">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Fresh Install</h1>
          <p className="text-muted-foreground">
            Download, configure, and register a new dedicated server.
          </p>
        </div>

        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-0">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === step.id;
              const isComplete = currentStep > step.id;
              const isClickable =
                step.id <= currentStep || stepValidation[step.id as keyof typeof stepValidation];

              return (
                <div key={step.id} className="flex items-center">
                  <button
                    onClick={() => isClickable && setCurrentStep(step.id)}
                    disabled={!isClickable}
                    aria-current={isActive ? "step" : undefined}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 sm:px-3.5 sm:py-2 rounded-full border transition-colors",
                      isActive && "border-primary bg-primary text-primary-foreground shadow-sm",
                      !isActive && isComplete && "border-primary/40 bg-primary/[0.08] text-primary",
                      !isActive && !isComplete && "border-border/50 bg-muted/30 text-muted-foreground",
                      isClickable && !isActive && "hover:border-primary/40 hover:bg-muted/60 cursor-pointer",
                    )}
                  >
                    {isComplete ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                    <span className="text-[11px] font-medium uppercase tracking-wide hidden sm:inline">
                      {step.label}
                    </span>
                  </button>
                  {index < STEPS.length - 1 && (
                    <span
                      className={cn("w-6 sm:w-10 h-px mx-1", isComplete ? "bg-primary/50" : "bg-border/60")}
                      aria-hidden="true"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">{renderStepContent()}</CardContent>
        </Card>

        {!isLastStep && (
          <div className="space-y-2">
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  if (currentStep === 1) {
                    onBack();
                  } else {
                    setCurrentStep((s) => s - 1);
                  }
                }}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                {currentStep === 1 ? "Choose Setup Type" : "Back"}
              </Button>

              <Button onClick={() => setCurrentStep((s) => s + 1)} disabled={!flow.canProceed}>
                Next Step
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            {!flow.canProceed && (
              <p className="text-sm text-warning">{flow.getStepRequirementMessage()}</p>
            )}
          </div>
        )}

        {isLastStep && !process.installing && !process.installComplete && (
          <div className="flex justify-start">
            <Button variant="outline" onClick={() => setCurrentStep((s) => s - 1)}>
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </div>
        )}
      </div>

      <FolderBrowser
        open={flow.browseOpen}
        onOpenChange={flow.setBrowseOpen}
        onSelect={(path) => flow.browseSetter?.fn(path)}
        initialPath={flow.browseSetter?.initial}
        title={flow.browseSetter?.title}
      />
    </>
  );
}
