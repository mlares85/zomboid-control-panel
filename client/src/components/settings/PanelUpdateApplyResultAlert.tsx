import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { panelUpdateApi, PanelUpdateStatus } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { formatTimestamp } from "@/lib/settingsFormat";

interface PanelUpdateApplyResultAlertProps {
  panelUpdateStatus: PanelUpdateStatus | null;
  panelApplyResultDismissed: boolean;
  setPanelApplyResultDismissed: (value: boolean) => void;
  panelApplyLog: string | null;
  setPanelApplyLog: (value: string | null) => void;
}

// Shows what happened the last time a downloaded update tried to apply —
// either a quiet success confirmation, or a detailed failure breakdown with
// the likely cause (AV quarantine, locked file, permissions, blocked
// helper) and the raw helper log.
export function PanelUpdateApplyResultAlert({
  panelUpdateStatus,
  panelApplyResultDismissed,
  setPanelApplyResultDismissed,
  panelApplyLog,
  setPanelApplyLog,
}: PanelUpdateApplyResultAlertProps) {
  const { toast } = useToast();
  const result = panelUpdateStatus?.lastApplyResult;
  if (!result || panelApplyResultDismissed) return null;

  if (result.status === "success") {
    // Hide the stale success banner if the panel has since moved to a
    // different version (or there's already a newer staged update). The
    // banner should only reflect the version that's currently running.
    const stale =
      (result.appliedVersion &&
        panelUpdateStatus?.currentVersion &&
        result.appliedVersion !== panelUpdateStatus.currentVersion) ||
      panelUpdateStatus?.stagedUpdate;
    if (stale) return null;
    return (
      <Alert variant="success">
        <AlertTitle>Update Applied</AlertTitle>
        <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Panel is now running v
            {result.appliedVersion || panelUpdateStatus?.currentVersion}
            {result.at ? ` (applied ${formatTimestamp(result.at)})` : ""}.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPanelApplyResultDismissed(true)}
            className="self-start"
          >
            Dismiss
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Update Failed to Apply</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span className="break-words">
          Panel is still running v
          {result.currentVersion || panelUpdateStatus?.currentVersion}.
          {result.pendingVersion
            ? ` Expected v${result.pendingVersion}.`
            : ""}
          {result.stagedStillPresent
            ? " The downloaded file is still on disk; you can retry the restart."
            : " The staged binary is gone — re-download the update before retrying."}
        </span>
        {result.likelyCause === "av_quarantine" && (
          <div className="rounded-md border border-destructive/40 bg-background/50 p-2 text-xs leading-relaxed">
            <strong className="text-destructive-foreground">
              Likely cause:
            </strong>{" "}
            antivirus or Controlled Folder Access deleted the new binary
            after it was placed.
            {result.panelFolder && (
              <div className="mt-1">
                Add this folder to your AV exclusions and retry:
                <pre className="mt-1 rounded bg-background/70 p-1 text-[11px]">
                  {result.panelFolder}
                </pre>
                <div className="mt-1 text-[11px] opacity-80">
                  Windows Defender:{" "}
                  <code>
                    Add-MpPreference -ExclusionPath{" "}
                    {JSON.stringify(result.panelFolder)}
                  </code>
                </div>
              </div>
            )}
          </div>
        )}
        {result.likelyCause === "rename_locked" && (
          <div className="rounded-md border border-destructive/40 bg-background/50 p-2 text-xs leading-relaxed">
            <strong className="text-destructive-foreground">
              Likely cause:
            </strong>{" "}
            another process (OneDrive, AV, or a file watcher) held the exe
            locked. Pause OneDrive or close explorer windows pointing at the
            folder, then retry.
          </div>
        )}
        {result.likelyCause === "permission" && (
          <div className="rounded-md border border-destructive/40 bg-background/50 p-2 text-xs leading-relaxed">
            <strong className="text-destructive-foreground">
              Likely cause:
            </strong>{" "}
            access denied writing to the panel folder. Relaunch the panel as
            Administrator or move it out of Program Files.
          </div>
        )}
        {result.likelyCause === "helper_blocked" && (
          <div className="rounded-md border border-destructive/40 bg-background/50 p-2 text-xs leading-relaxed">
            <strong className="text-destructive-foreground">
              Likely cause:
            </strong>{" "}
            the update helper script was blocked from running (Windows
            Defender ASR, AppLocker, or Group Policy). The staged binary is
            still on disk.
            {result.panelFolder && (
              <div className="mt-1">
                <strong>Recovery:</strong> close this panel and double-click{" "}
                <code>Start.bat</code> in:
                <pre className="mt-1 rounded bg-background/70 p-1 text-[11px]">
                  {result.panelFolder}
                </pre>
                <div className="mt-1 text-[11px] opacity-80">
                  Start.bat picks the newest binary automatically, so the
                  update will apply. To prevent this in the future, add the
                  panel folder to AV exclusions.
                </div>
              </div>
            )}
          </div>
        )}
        {result.likelyCause === "no_helper_log" && (
          <div className="rounded-md border border-destructive/40 bg-background/50 p-2 text-xs leading-relaxed">
            <strong className="text-destructive-foreground">
              No helper log was written.
            </strong>{" "}
            The helper script may have been blocked by execution policy or
            AV. Check Windows Defender protection history.
          </div>
        )}
        {panelApplyLog && (
          <details className="mt-1 text-xs">
            <summary className="cursor-pointer font-medium">
              Show helper log
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-destructive/30 bg-background/60 p-2 text-[11px] leading-snug whitespace-pre-wrap break-all">
              {panelApplyLog}
            </pre>
          </details>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPanelApplyResultDismissed(true)}
          >
            Dismiss
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const { log: helperLog } = await panelUpdateApi.getApplyLog();
                setPanelApplyLog(helperLog || "No helper log found.");
              } catch (error) {
                toast({
                  title: "Could not read log",
                  description:
                    error instanceof Error
                      ? error.message
                      : "Failed to read helper log.",
                  variant: "destructive",
                });
              }
            }}
          >
            Refresh log
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
