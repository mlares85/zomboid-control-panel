import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Download, CheckCircle, Plus, ArrowRight, Info, Container,
} from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FieldHelp } from "@/components/FieldHelp";
import { DockerSetup } from "@/components/addServer/DockerSetup";
import { FullInstallFlow } from "@/components/addServer/FullInstallFlow";
import { QuickSetupFlow } from "@/components/addServer/QuickSetupFlow";

type SetupMode = "select" | "full" | "quick" | "docker";

function handleCardKeyDown(
  event: React.KeyboardEvent<HTMLDivElement>,
  onActivate: () => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onActivate();
  }
}

export default function ServerSetup() {
  const location = useLocation();
  const navigate = useNavigate();
  const incomingState = location.state as { branch?: string } | null;
  const [setupMode, setSetupMode] = useState<SetupMode>("select");

  const handleServerCreated = () => navigate("/");

  if (setupMode === "docker") {
    return <DockerSetup onBack={() => setSetupMode("select")} />;
  }
  if (setupMode === "full") {
    return (
      <FullInstallFlow
        onBack={() => setSetupMode("select")}
        onServerCreated={handleServerCreated}
        initialBranch={incomingState?.branch}
      />
    );
  }
  if (setupMode === "quick") {
    return (
      <QuickSetupFlow
        onBack={() => setSetupMode("select")}
        onServerCreated={handleServerCreated}
      />
    );
  }

  return <ModeSelector onSelect={setSetupMode} />;
}

// ── Mode selector cards ──

const CARD_BASE =
  "group relative overflow-hidden cursor-pointer border-border/60 bg-card transition-[border-color,box-shadow,transform] hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const CARD_PRIMARY =
  "group relative overflow-hidden cursor-pointer border-primary/35 bg-gradient-to-br from-primary/[0.06] via-card to-card ring-1 ring-primary/15 transition-[border-color,box-shadow,transform] hover:border-primary/55 hover:ring-primary/25 hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function ModeSelector({ onSelect }: { onSelect: (m: SetupMode) => void }) {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true" />
          New Server
        </span>
        <h1 className="text-3xl font-bold">Server Setup</h1>
        <p className="text-muted-foreground text-base">
          Choose how you want to bring a Project Zomboid server online.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <ModeCard
          mode="full"
          primary
          icon={Download}
          title="Fresh Install"
          description="Download PZ server files and run the server as a process on this machine"
          features={[
            <>Downloads server files via SteamCMD <span className="text-foreground/60">(~3 GB)</span></>,
            "Choose game version branch",
            "Generates config and startup files automatically",
          ]}
          cta="Begin install"
          badge="Recommended"
          fieldHelp={{
            description: "Downloads a new dedicated server via SteamCMD and manages it as a native process.",
            context: "Best if you want the panel to own the full install and don't need container isolation. Requires ~3GB free disk space and SteamCMD.",
          }}
          onSelect={() => onSelect("full")}
        />
        <ModeCard
          mode="quick"
          icon={Plus}
          title="Use Existing Files (Local)"
          description="Point at PZ server files you already have and run the server as a local process"
          features={[
            "No download required",
            "Point to an existing PZ server folder",
            "Fast 3-step setup",
          ]}
          cta="Register server"
          fieldHelp={{
            description: "Registers a server folder you already downloaded/installed outside the panel and runs PZ as a local process.",
            context: "Use this if you migrated files from another tool or already ran SteamCMD manually — no new download happens. Not for Docker setups.",
          }}
          onSelect={() => onSelect("quick")}
        />
        <ModeCard
          mode="docker"
          icon={Container}
          title="Docker Server"
          description="Create an isolated Docker container running PZ — the panel controls its full lifecycle"
          features={[
            "Shared server files across instances",
            "Auto port assignment",
            "Isolated saves and mods per server",
          ]}
          cta="Set up container"
          fieldHelp={{
            description: "Panel creates and manages this server inside a Docker container instead of a native process.",
            context: "Good for isolating multiple servers with shared base game files, but requires Docker (or OrbStack on macOS) installed and running first.",
          }}
          onSelect={() => onSelect("docker")}
        />
      </div>

      <Card className="bg-secondary/40 border-border/70 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg border border-primary/20 bg-primary/10 flex items-center justify-center shrink-0">
              <Info className="w-5 h-5 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">Not sure which to choose?</p>
              <p className="text-sm text-muted-foreground">
                If you've never set up a Project Zomboid server before, choose{" "}
                <strong>Fresh Install</strong>. It will download everything you need automatically.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ModeCardProps {
  mode: SetupMode;
  primary?: boolean;
  icon: typeof Download;
  title: string;
  description: string;
  features: React.ReactNode[];
  cta: string;
  badge?: string;
  fieldHelp: { description: string; context: string };
  onSelect: () => void;
}

function ModeCard({ primary, icon: Icon, title, description, features, cta, badge, fieldHelp, onSelect }: ModeCardProps) {
  return (
    <Card
      role="button"
      tabIndex={0}
      className={primary ? CARD_PRIMARY : CARD_BASE}
      onClick={onSelect}
      onKeyDown={(event) => handleCardKeyDown(event, onSelect)}
    >
      {primary && <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary via-primary/80 to-primary/40" aria-hidden="true" />}
      {badge && (
        <div className="absolute right-3 top-3">
          <Badge variant="secondary" className="text-[10px] font-medium uppercase tracking-wide">{badge}</Badge>
        </div>
      )}
      <CardHeader className="pb-3">
        <div className={`grid place-items-center w-11 h-11 rounded-md border mb-3 transition-colors ${
          primary
            ? "border-primary/30 bg-primary/[0.08] text-primary group-hover:bg-primary/15"
            : "border-border/55 bg-muted/40 text-muted-foreground group-hover:border-primary/30 group-hover:bg-primary/[0.06] group-hover:text-primary"
        }`}>
          <Icon className="w-5 h-5" />
        </div>
        <CardTitle className="text-lg flex items-center gap-1.5">
          {title}
          <FieldHelp description={fieldHelp.description} context={fieldHelp.context} recommendation={primary ? "safe-default" : "advanced"} articleId={primary ? "first-run-checklist" : "adding-servers"} />
        </CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pb-5">
        <ul className="space-y-1.5 text-[13px]">
          {features.map((feat, i) => (
            <li key={i} className="flex items-start gap-2 text-muted-foreground">
              <CheckCircle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${primary ? "text-primary" : "text-muted-foreground/70"}`} />
              <span>{feat}</span>
            </li>
          ))}
        </ul>
        <div className={`flex items-center gap-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide ${
          primary ? "text-primary/90" : "text-muted-foreground transition-colors group-hover:text-primary/90"
        }`}>
          {cta} <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      </CardContent>
    </Card>
  );
}
