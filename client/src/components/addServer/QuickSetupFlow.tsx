import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  HardDrive,
  Plus,
  Settings2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FolderBrowser } from "@/components/FolderBrowser";
import { FolderStep } from "@/components/addServer/quickSetup/FolderStep";
import { ConfigStep } from "@/components/addServer/quickSetup/ConfigStep";
import { ReviewStep } from "@/components/addServer/quickSetup/ReviewStep";
import { useQuickSetupFlow } from "@/components/addServer/quickSetup/useQuickSetupFlow";

export type { InstallLog } from "@/components/addServer/quickSetup/types";

interface QuickSetupFlowProps {
  onServerCreated: (serverId: string | number) => void;
  onBack: () => void;
  /** Pre-fill install path from environment scan. */
  initialInstallPath?: string;
}

const STEPS = [
  { id: 1, label: "Location", icon: HardDrive },
  { id: 2, label: "Configure", icon: Settings2 },
  { id: 3, label: "Create", icon: Plus },
];

// Shell for the 3-step "Quick Setup" (use existing files) server setup flow.
// All state/effects/handlers live in useQuickSetupFlow + its per-step hooks;
// this component only wires props and renders the current step. Mirrors
// FullInstallFlow.tsx's shape for the equivalent "Fresh Install" flow.
export function QuickSetupFlow({ onServerCreated, onBack, initialInstallPath }: QuickSetupFlowProps) {
  const flow = useQuickSetupFlow({ onServerCreated, initialInstallPath });
  const { config, process, currentStep, setCurrentStep, stepValidation } = flow;

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <FolderStep
            installPath={config.installPath}
            onInstallPathChange={config.setInstallPath}
            onBrowseFolder={flow.handleBrowseFolder}
          />
        );
      case 2:
        return (
          <ConfigStep
            serverName={config.serverName}
            onServerNameChange={config.setServerName}
            passwords={{
              rconPassword: config.rconPassword,
              onRconPasswordChange: config.setRconPassword,
              rconPort: config.rconPort,
              onRconPortChange: config.setRconPort,
              rconVisible: config.showRconPassword,
              onToggleRconVisible: () => config.setShowRconPassword((v) => !v),
              copied: config.copiedPassword,
              onCopy: config.handleCopyPassword,
              onRegenerate: config.handleRegeneratePassword,
              adminPassword: config.adminPassword,
              onAdminPasswordChange: config.setAdminPassword,
              adminVisible: config.showAdminPassword,
              onToggleAdminVisible: () => config.setShowAdminPassword((v) => !v),
            }}
            memory={{
              min: config.minMemory,
              max: config.maxMemory,
              onMinChange: config.setMinMemory,
              onMaxChange: config.setMaxMemory,
              systemRam: config.systemRam,
              detecting: config.detectingRam,
            }}
            advanced={{
              serverPort: config.serverPort,
              onServerPortChange: config.setServerPort,
              useUpnp: config.useUpnp,
              onUseUpnpChange: config.setUseUpnp,
              useNoSteam: config.useNoSteam,
              onUseNoSteamChange: config.setUseNoSteam,
              useDebug: config.useDebug,
              onUseDebugChange: config.setUseDebug,
              dataPath: {
                enabled: config.useCustomDataPath,
                onEnabledChange: config.setUseCustomDataPath,
                value: config.zomboidDataPath,
                onValueChange: config.setZomboidDataPath,
              },
            }}
            onBrowseFolder={flow.handleBrowseFolder}
          />
        );
      case 3:
        return (
          <ReviewStep
            summary={{
              installPath: config.installPath,
              serverName: config.serverName,
              minMemory: config.minMemory,
              maxMemory: config.maxMemory,
              serverPort: config.serverPort,
              rconPort: config.rconPort,
            }}
            installing={process.installing}
            installComplete={process.installComplete}
            missingAdminPassword={config.missingAdminPassword}
            logs={process.logs}
            logsEndRef={process.logsEndRef}
            onCreate={flow.handleCreate}
          />
        );
    }
  };

  const isLastStep = currentStep === flow.stepCount;

  return (
    <>
      <div className="max-w-3xl mx-auto space-y-6 page-transition">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Quick Setup</h1>
          <p className="text-muted-foreground">
            Create and register a server using existing dedicated server files.
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
