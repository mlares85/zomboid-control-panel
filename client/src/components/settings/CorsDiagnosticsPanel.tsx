import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CorsDiagnostics } from "@/lib/settingsTypes";
import { formatTimestamp } from "@/lib/settingsFormat";

interface CorsDiagnosticsPanelProps {
  corsOriginValidationError: string | null;
  corsDiagnostics: CorsDiagnostics | null;
  corsLoading: boolean;
  corsUpdating: boolean;
  saving: boolean;
  handleReloadCorsRules: () => Promise<void>;
  fetchCorsDiagnostics: () => Promise<void>;
  handleClearCorsBlocked: () => Promise<void>;
}

// Reload/refresh/clear controls plus the blocked-origin log, for the
// Remote Access (CORS) tab.
export function CorsDiagnosticsPanel({
  corsOriginValidationError,
  corsDiagnostics,
  corsLoading,
  corsUpdating,
  saving,
  handleReloadCorsRules,
  fetchCorsDiagnostics,
  handleClearCorsBlocked,
}: CorsDiagnosticsPanelProps) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleReloadCorsRules}
          disabled={corsUpdating || saving || Boolean(corsOriginValidationError)}
          className="gap-2"
        >
          {corsUpdating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Reload CORS Rules
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={fetchCorsDiagnostics}
          disabled={corsLoading || corsUpdating}
          className="gap-2"
        >
          <RefreshCw className={cn("w-4 h-4", corsLoading && "animate-spin")} />
          Refresh Diagnostics
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClearCorsBlocked}
          disabled={corsUpdating || !corsDiagnostics?.blockedCount}
          className="gap-2 text-muted-foreground"
        >
          <Trash2 className="w-4 h-4" />
          Clear Blocked Log
        </Button>
      </div>

      <div className="grid gap-3 text-xs sm:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
          <p className="text-muted-foreground">Blocked Origins</p>
          <p className="mt-1 font-medium text-foreground">
            {corsDiagnostics?.blockedCount ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
          <p className="text-muted-foreground">Effective Allowlist</p>
          <p className="mt-1 font-medium text-foreground">
            {corsDiagnostics?.effectiveAllowedOrigins.length ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
          <p className="text-muted-foreground">Last Reload</p>
          <p className="mt-1 font-medium text-foreground">
            {formatTimestamp(corsDiagnostics?.lastLoadedAt || null)}
          </p>
        </div>
      </div>

      {!!corsDiagnostics?.blocked.length && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">
            Recent Blocked Origins
          </p>
          <ScrollArea className="h-[150px] rounded-lg border border-border/60 bg-muted/20 p-2">
            <div className="space-y-2 pr-2">
              {corsDiagnostics.blocked.slice(0, 12).map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md border border-border/50 bg-background/60 px-2 py-1.5 text-xs"
                >
                  <p className="font-mono break-all text-foreground">
                    {entry.origin}
                  </p>
                  <p className="text-muted-foreground">
                    {entry.source.toUpperCase()} •{" "}
                    {formatTimestamp(entry.blockedAt)}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </>
  );
}
