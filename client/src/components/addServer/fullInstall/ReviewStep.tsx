import type { RefObject } from "react";
import { Download, Loader2, Terminal, Info, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { InstallLog } from "./types";

interface ReviewSummary {
  installPath: string;
  serverName: string;
  branch: string;
  minMemory: number;
  maxMemory: number;
  serverPort: number;
  rconPort: number;
}

interface InstallProgress {
  percent: number;
  downloaded: string;
  total: string;
  status: string;
}

interface ReviewStepProps {
  summary: ReviewSummary;
  installing: boolean;
  installComplete: boolean;
  missingAdminPassword: boolean;
  installProgress: InstallProgress | null;
  logs: InstallLog[];
  logsEndRef: RefObject<HTMLDivElement>;
  onInstall: () => void;
}

// Full Install Step 4: summary, install trigger, live progress and log output.
export function ReviewStep({
  summary,
  installing,
  installComplete,
  missingAdminPassword,
  installProgress,
  logs,
  logsEndRef,
  onInstall,
}: ReviewStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 pb-6 border-b">
        <h2 className="text-2xl font-semibold">Review and Install</h2>
        <p className="text-muted-foreground">
          Confirm your settings, then begin the server download.
        </p>
      </div>

      {/* Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Installation Path</span>
              <span className="font-mono text-right max-w-[300px] truncate">
                {summary.installPath}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Server Name</span>
              <span className="font-mono">{summary.serverName}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Game Version</span>
              <span>
                {summary.branch === "public"
                  ? "Build 42 (Stable)"
                  : summary.branch}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Memory</span>
              <span className="font-mono">
                {summary.minMemory}GB - {summary.maxMemory}GB
              </span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Game Port</span>
              <span className="font-mono">{summary.serverPort}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">RCON Port</span>
              <span className="font-mono">{summary.rconPort}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Port Info */}
      <div className="bg-muted/50 border border-border/60 rounded-lg p-4 text-sm shadow-sm">
        <p className="font-medium flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" />
          Firewall / Port Forwarding
        </p>
        <p className="text-muted-foreground mt-1">
          Make sure your firewall or router allows:
        </p>
        <ul className="mt-2 space-y-1 text-muted-foreground">
          <li>
            •{" "}
            <code className="bg-muted px-1 rounded">
              {summary.serverPort}
            </code>{" "}
            UDP - Game traffic
          </li>
          <li>
            •{" "}
            <code className="bg-muted px-1 rounded">
              {summary.serverPort + 1}
            </code>{" "}
            UDP - Direct connect
          </li>
        </ul>
      </div>

      {/* Install Button */}
      <Button
        onClick={onInstall}
        disabled={installing || missingAdminPassword || installComplete}
        className="w-full"
        size="lg"
      >
        {installing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Installing server... check the log below
          </>
        ) : (
          <>
            <Download className="w-4 h-4 mr-2" />
            Install Project Zomboid Server
          </>
        )}
      </Button>

      {missingAdminPassword && (
        <p className="text-sm text-warning">
          Add an Admin Password in Advanced Options before installing.
        </p>
      )}

      {/* Installation Progress Bar */}
      {installing && installProgress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {installProgress.status}
            </span>
            <span className="font-mono">
              {installProgress.percent.toFixed(0)}%
              {installProgress.downloaded && installProgress.total && (
                <span className="text-muted-foreground ml-2">
                  ({installProgress.downloaded} / {installProgress.total})
                </span>
              )}
            </span>
          </div>
          <Progress value={installProgress.percent} className="h-2" />
        </div>
      )}

      {/* Installation Log */}
      {logs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            <span className="text-sm font-medium">Installation Log</span>
          </div>
          <ScrollArea className="h-[200px] bg-black rounded-lg p-3">
            <div className="font-mono text-xs space-y-0.5">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={cn(
                    log.type === "error" || log.type === "stderr"
                      ? "text-destructive"
                      : log.type === "success"
                        ? "text-success"
                        : log.type === "command"
                          ? "text-primary"
                          : "text-foreground/80",
                  )}
                >
                  {log.message}
                </div>
              ))}
              {installing && (
                <div className="text-muted-foreground animate-pulse">...</div>
              )}
              <div ref={logsEndRef} />
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Post-install: server registration is automatic — see FullInstallFlow */}
      {installComplete && (
        <Card className="border-primary/32 bg-card shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">
                Installation complete — setting up your new server...
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
