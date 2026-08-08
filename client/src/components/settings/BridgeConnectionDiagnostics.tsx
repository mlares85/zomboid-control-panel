import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBridgeAge } from "@/lib/settingsFormat";
import { BridgeStatus } from "@/hooks/settings/useBridgeStatus";

interface BridgeConnectionDiagnosticsProps {
  bridgeStatus: BridgeStatus;
}

// Shown when the bridge watcher is running but the mod hasn't connected —
// per-check pass/fail grid plus the status-file freshness so the admin can
// tell "not started yet" from "actually broken".
export function BridgeConnectionDiagnostics({
  bridgeStatus,
}: BridgeConnectionDiagnosticsProps) {
  if (!bridgeStatus.connection) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border/40">
        <Info className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">
          Connection Diagnostics
        </span>
        {bridgeStatus.consecutiveFailures != null &&
          bridgeStatus.consecutiveFailures > 0 && (
            <span className="ml-auto text-[10px] tabular-nums text-warning">
              {bridgeStatus.consecutiveFailures} consecutive failures
            </span>
          )}
      </div>
      <div className="p-3 space-y-3">
        {/* Summary */}
        <p className="text-xs text-muted-foreground">
          {bridgeStatus.connection.summary}
        </p>

        {/* Issues list */}
        {bridgeStatus.connection.issues &&
          bridgeStatus.connection.issues.length > 0 && (
            <div className="space-y-1">
              {bridgeStatus.connection.issues.map((issue: string, i: number) => (
                <div
                  key={i}
                  className="flex items-start gap-1.5 text-xs text-destructive"
                >
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          )}

        {/* File checks grid */}
        {bridgeStatus.connection.checks && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            {Object.entries(bridgeStatus.connection.checks).map(
              ([key, val]) => {
                if (key === "statusAgeMs") return null;
                const label = key
                  .replace(/([A-Z])/g, " $1")
                  .replace(/^./, (s) => s.toUpperCase())
                  .trim();
                const passed = val === true;
                return (
                  <div key={key} className="flex items-center gap-1.5">
                    {passed ? (
                      <CheckCircle2
                        className="w-3 h-3 text-primary shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <XCircle
                        className="w-3 h-3 text-destructive shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={cn(
                        passed ? "text-muted-foreground" : "text-destructive/90",
                      )}
                    >
                      {label}
                    </span>
                  </div>
                );
              },
            )}
          </div>
        )}

        {/* Status file info */}
        {bridgeStatus.statusFile && (
          <div className="text-[11px] text-muted-foreground space-y-0.5 pt-1 border-t border-border/30">
            <div className="flex items-center gap-1.5">
              <span className="opacity-60">Status file:</span>
              <span
                className={
                  bridgeStatus.statusFile.exists
                    ? "text-foreground"
                    : "text-destructive/70"
                }
              >
                {bridgeStatus.statusFile.exists ? "Present" : "Not found"}
              </span>
              {bridgeStatus.statusFile.ageSeconds != null && (
                <span className="opacity-50">
                  ({formatBridgeAge(bridgeStatus.statusFile.ageSeconds)} ago)
                </span>
              )}
            </div>
            {bridgeStatus.statusFile.path && (
              <div className="break-all opacity-50">
                <code className="text-[10px]">{bridgeStatus.statusFile.path}</code>
              </div>
            )}
          </div>
        )}

        {/* File watcher status */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1 border-t border-border/30">
          <span>
            File watcher:{" "}
            {bridgeStatus.hasFileWatcher ? (
              <span className="text-primary">Active</span>
            ) : (
              <span className="text-warning">Polling only</span>
            )}
          </span>
          {bridgeStatus.pendingCommands > 0 && (
            <span>
              Pending:{" "}
              <span className="text-warning tabular-nums">
                {bridgeStatus.pendingCommands}
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
