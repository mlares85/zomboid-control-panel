import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container, Settings2, CheckCircle, Loader2, ChevronLeft,
  Play, ArrowRight, AlertTriangle,
} from "lucide-react";
import { dockerApi } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { DockerPrereqStep } from "./DockerPrereqStep";
import { DockerConfigStep } from "./DockerConfigStep";

interface DockerSetupProps {
  onBack: () => void;
}

type CreatePhase =
  | "idle" | "creating-volumes" | "pulling-image"
  | "creating-container" | "starting-server" | "done";

const PHASE_LABELS: Record<CreatePhase, string> = {
  idle: "", "creating-volumes": "Creating volumes...",
  "pulling-image": "Pulling image...", "creating-container": "Creating container...",
  "starting-server": "Starting server...", done: "Done!",
};

const PHASE_PROGRESS: Record<CreatePhase, number> = {
  idle: 0, "creating-volumes": 15, "pulling-image": 40,
  "creating-container": 70, "starting-server": 90, done: 100,
};

export interface DockerConfig {
  serverName: string;
  gamePort: number;
  rconPort: number;
  rconPassword: string;
  minMemory: number;
  maxMemory: number;
  adminPassword: string;
}

const STEPS = [
  { id: 1, label: "Prerequisites", icon: Container },
  { id: 2, label: "Configure", icon: Settings2 },
  { id: 3, label: "Create", icon: Play },
];

export function DockerStepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center mb-8">
      <div className="flex items-center gap-0">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = currentStep === step.id;
          const isComplete = currentStep > step.id;
          return (
            <div key={step.id} className="flex items-center">
              <div className={cn(
                "flex items-center gap-2 px-3 py-2 sm:px-3.5 sm:py-2 rounded-full border transition-colors",
                isActive && "border-primary bg-primary text-primary-foreground shadow-sm",
                !isActive && isComplete && "border-primary/40 bg-primary/[0.08] text-primary",
                !isActive && !isComplete && "border-border/50 bg-muted/30 text-muted-foreground",
              )}>
                {isComplete ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                <span className="text-[11px] font-medium uppercase tracking-wide hidden sm:inline">
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <span className={cn("w-6 sm:w-10 h-px mx-1", isComplete ? "bg-primary/50" : "bg-border/60")} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DockerSetup({ onBack }: DockerSetupProps) {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [config, setConfig] = useState<DockerConfig>({
    serverName: "zomboid", gamePort: 16261, rconPort: 27015,
    rconPassword: "", minMemory: 4, maxMemory: 8, adminPassword: "",
  });
  const [createPhase, setCreatePhase] = useState<CreatePhase>("idle");
  const [createError, setCreateError] = useState<string | null>(null);

  // Prefill available ports
  useEffect(() => {
    dockerApi.getAvailablePorts()
      .then((ports) => setConfig((c) => ({ ...c, gamePort: ports.gamePort, rconPort: ports.rconPort })))
      .catch(() => {});
  }, []);

  const handleCreate = async () => {
    setCreateError(null);
    setCreatePhase("creating-volumes");
    const phaseTimer = setInterval(() => {
      setCreatePhase((prev) => {
        if (prev === "creating-volumes") return "pulling-image";
        if (prev === "pulling-image") return "creating-container";
        if (prev === "creating-container") return "starting-server";
        return prev;
      });
    }, 3000);

    try {
      const result = await dockerApi.createManagedServer({
        serverName: config.serverName, gamePort: config.gamePort,
        rconPort: config.rconPort, rconPassword: config.rconPassword,
        minMemoryMb: config.minMemory * 1024, maxMemoryMb: config.maxMemory * 1024,
        adminPassword: config.adminPassword,
      });
      clearInterval(phaseTimer);
      if (result.success) { setCreatePhase("done"); }
      else { setCreatePhase("idle"); setCreateError(result.error ?? "Failed to create server"); }
    } catch (e) {
      clearInterval(phaseTimer);
      setCreatePhase("idle");
      setCreateError(e instanceof Error ? e.message : "Unexpected error creating server");
    }
  };

  if (currentStep === 1) {
    return <DockerPrereqStep onBack={onBack} onContinue={() => setCurrentStep(2)} />;
  }

  if (currentStep === 2) {
    return (
      <DockerConfigStep
        config={config}
        onChange={setConfig}
        onBack={() => setCurrentStep(1)}
        onNext={() => setCurrentStep(3)}
      />
    );
  }

  // Step 3: Review & Create
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <DockerStepIndicator currentStep={3} />
      <div className="text-center space-y-2 pb-4">
        <h2 className="text-2xl font-semibold">Create Docker Server</h2>
        <p className="text-muted-foreground">Review your settings and create the container.</p>
      </div>

      {createPhase === "idle" && (
        <>
          <Card>
            <CardContent className="pt-6">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Server Name</dt>
                <dd className="font-mono">{config.serverName}</dd>
                <dt className="text-muted-foreground">Game Port</dt>
                <dd className="font-mono">{config.gamePort}</dd>
                <dt className="text-muted-foreground">RCON Port</dt>
                <dd className="font-mono">{config.rconPort}</dd>
                <dt className="text-muted-foreground">Memory</dt>
                <dd className="font-mono">{config.minMemory}GB &ndash; {config.maxMemory}GB</dd>
              </dl>
            </CardContent>
          </Card>

          {createError && (
            <Card className="border-destructive/50">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Creation failed</p>
                    <p className="text-sm text-muted-foreground mt-1">{createError}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button variant="outline" onClick={() => setCurrentStep(2)}>
              <ChevronLeft className="w-4 h-4 mr-2" />Back
            </Button>
            <Button onClick={handleCreate}>
              <Container className="w-4 h-4 mr-2" />Create Docker Server
            </Button>
          </div>
        </>
      )}

      {createPhase !== "idle" && createPhase !== "done" && (
        <Card>
          <CardContent className="py-8 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="font-medium">{PHASE_LABELS[createPhase]}</span>
            </div>
            <Progress value={PHASE_PROGRESS[createPhase]} className="h-2" />
            <p className="text-sm text-muted-foreground">
              This may take a few minutes if base files need to download.
            </p>
          </CardContent>
        </Card>
      )}

      {createPhase === "done" && (
        <Card className="border-green-500/40">
          <CardContent className="py-8 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-500" />
              <span className="text-lg font-semibold">Docker server created successfully!</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Your server <strong>{config.serverName}</strong> is ready. Head to the dashboard to manage it.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={() => navigate("/")}>
                Open Dashboard<ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
