import type { RefObject } from "react";
import { CheckCircle, Loader2, Plus, Terminal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { InstallLog } from "./types";

interface ReviewSummary {
  installPath: string;
  serverName: string;
  minMemory: number;
  maxMemory: number;
  serverPort: number;
  rconPort: number;
}

interface ReviewStepProps {
  summary: ReviewSummary;
  installing: boolean;
  installComplete: boolean;
  missingAdminPassword: boolean;
  logs: InstallLog[];
  logsEndRef: RefObject<HTMLDivElement>;
  onCreate: () => void;
}

function logColor(type: InstallLog["type"]) {
  if (type === "error") return "text-destructive";
  if (type === "success") return "text-success";
  return "text-foreground/80";
}

// Quick Setup Step 3: summary, create trigger, and live setup log. Server
// registration is automatic on success — see useQuickSetupProcess.
export function ReviewStep({
  summary,
  installing,
  installComplete,
  missingAdminPassword,
  logs,
  logsEndRef,
  onCreate,
}: ReviewStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 pb-6 border-b">
        <h2 className="text-2xl font-semibold">Review and Create</h2>
        <p className="text-muted-foreground">
          Confirm these settings, then create your server entry.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Server Files</span>
              <span className="font-mono text-right max-w-[300px] truncate">
                {summary.installPath}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Server Name</span>
              <span className="font-mono">{summary.serverName}</span>
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

      <Button
        onClick={onCreate}
        disabled={installing || installComplete || missingAdminPassword}
        className="w-full"
        size="lg"
      >
        {installing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Creating server...
          </>
        ) : (
          <>
            <Plus className="w-4 h-4 mr-2" />
            Create Server
          </>
        )}
      </Button>

      {missingAdminPassword && (
        <p className="text-sm text-warning">
          Add an Admin Password in Advanced Options before creating the server.
        </p>
      )}

      {logs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            <span className="text-sm font-medium">Setup Log</span>
          </div>
          <ScrollArea className="h-[150px] bg-black rounded-lg p-3">
            <div className="font-mono text-xs space-y-0.5">
              {logs.map((log, i) => (
                <div key={i} className={cn(logColor(log.type))}>
                  {log.message}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </ScrollArea>
        </div>
      )}

      {installComplete && (
        <Card className="border-primary/30 bg-card shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">
                Server created! Finishing up...
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
