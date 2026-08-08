import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PanelUpdatePreflight, PanelUpdateStatus } from "@/lib/api";
import { formatTimestamp } from "@/lib/settingsFormat";
import { PanelUpdateApplyResultAlert } from "./PanelUpdateApplyResultAlert";
import { UpdateActionButtons } from "./UpdateActionButtons";

interface UpdatesSettingsProps {
  panelUpdateStatus: PanelUpdateStatus | null;
  panelUpdateStatusError: string | null;
  checkingPanelUpdate: boolean;
  downloadingPanelUpdate: boolean;
  dockerUpdateConfirmOpen: boolean;
  setDockerUpdateConfirmOpen: (open: boolean) => void;
  panelUpdateReady: boolean;
  panelUpdatePreflight: PanelUpdatePreflight | null;
  panelApplyLog: string | null;
  setPanelApplyLog: (value: string | null) => void;
  panelApplyResultDismissed: boolean;
  setPanelApplyResultDismissed: (value: boolean) => void;
  fetchPanelUpdateStatus: () => Promise<void>;
  isDockerPanelUpdate: boolean;
  handleCheckPanelUpdate: () => Promise<void>;
  handleDownloadPanelUpdate: () => Promise<void>;
  isDirty: boolean;
  restarting: boolean;
  restartPanelWithReconnect: (description: string) => Promise<void>;
}

export function UpdatesSettings({
  panelUpdateStatus,
  panelUpdateStatusError,
  checkingPanelUpdate,
  downloadingPanelUpdate,
  dockerUpdateConfirmOpen,
  setDockerUpdateConfirmOpen,
  panelUpdateReady,
  panelUpdatePreflight,
  panelApplyLog,
  setPanelApplyLog,
  panelApplyResultDismissed,
  setPanelApplyResultDismissed,
  fetchPanelUpdateStatus,
  isDockerPanelUpdate,
  handleCheckPanelUpdate,
  handleDownloadPanelUpdate,
  isDirty,
  restarting,
  restartPanelWithReconnect,
}: UpdatesSettingsProps) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium">Panel Auto Update</p>
          <p className="text-xs text-muted-foreground">
            Check for a new release, download it, then apply on restart.
          </p>
        </div>
        {checkingPanelUpdate || panelUpdateStatus?.isChecking ? (
          <span className="inline-flex items-center rounded-full border border-border/60 bg-background/60 px-2.5 py-0.5 text-xs font-semibold text-foreground/85">
            Checking...
          </span>
        ) : downloadingPanelUpdate || panelUpdateStatus?.isDownloading ? (
          <span className="inline-flex items-center rounded-full border border-primary/35 bg-primary/12 px-2.5 py-0.5 text-xs font-semibold text-primary">
            Downloading...
          </span>
        ) : panelUpdateStatus?.updateAvailable ? (
          <span className="inline-flex items-center rounded-full border border-warning/35 bg-warning/12 px-2.5 py-0.5 text-xs font-semibold text-warning">
            Update available
          </span>
        ) : panelUpdateStatusError ? (
          <span className="inline-flex items-center rounded-full border border-destructive/35 bg-destructive/12 px-2.5 py-0.5 text-xs font-semibold text-destructive">
            Cannot reach updater
          </span>
        ) : !panelUpdateStatus ? (
          <span className="inline-flex items-center rounded-full border border-border/60 bg-background/60 px-2.5 py-0.5 text-xs font-semibold text-foreground/80">
            Not checked
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            Up to date
          </span>
        )}
      </div>

      {panelUpdateStatusError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Updater Error</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="break-words">{panelUpdateStatusError}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchPanelUpdateStatus}
              disabled={checkingPanelUpdate || downloadingPanelUpdate || restarting}
              className="self-start"
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 text-xs sm:grid-cols-2">
        <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2">
          <p className="text-muted-foreground">Installed</p>
          <p className="mt-1 font-medium text-foreground">
            v{panelUpdateStatus?.currentVersion || "Unknown"}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2">
          <p className="text-muted-foreground">Latest</p>
          <p className="mt-1 font-medium text-foreground">
            {panelUpdateStatus?.latestVersion
              ? `v${panelUpdateStatus.latestVersion}`
              : "Not checked yet"}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2">
          <p className="text-muted-foreground">Last Check</p>
          <p className="mt-1 font-medium text-foreground">
            {formatTimestamp(panelUpdateStatus?.lastCheck || null)}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2">
          <p className="text-muted-foreground">Release Published</p>
          <p className="mt-1 font-medium text-foreground">
            {formatTimestamp(panelUpdateStatus?.publishedAt || null)}
          </p>
        </div>
      </div>

      {(downloadingPanelUpdate || panelUpdateStatus?.isDownloading) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Downloading update</span>
            <span>{panelUpdateStatus?.downloadProgress ?? 0}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full w-full bg-primary transition-transform duration-200 ease-out"
              style={{
                transform: `translateX(-${100 - (panelUpdateStatus?.downloadProgress ?? 0)}%)`,
              }}
            />
          </div>
        </div>
      )}

      {panelUpdateStatus?.lastError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Last Update Error</AlertTitle>
          <AlertDescription className="break-words whitespace-pre-wrap">
            {panelUpdateStatus.lastError}
          </AlertDescription>
        </Alert>
      )}

      <PanelUpdateApplyResultAlert
        panelUpdateStatus={panelUpdateStatus}
        panelApplyResultDismissed={panelApplyResultDismissed}
        setPanelApplyResultDismissed={setPanelApplyResultDismissed}
        panelApplyLog={panelApplyLog}
        setPanelApplyLog={setPanelApplyLog}
      />

      {panelUpdatePreflight &&
        !panelUpdatePreflight.ok &&
        (panelUpdateStatus?.updateAvailable ||
          panelUpdateStatus?.stagedUpdate) && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Update Blocked</AlertTitle>
            <AlertDescription>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {panelUpdatePreflight.blockers.map((b, i) => (
                  <li key={`blk-${i}`} className="break-words">
                    {b}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

      {panelUpdatePreflight &&
        panelUpdatePreflight.ok &&
        panelUpdatePreflight.warnings.length > 0 &&
        (panelUpdateStatus?.updateAvailable ||
          panelUpdateStatus?.stagedUpdate) &&
        !(
          panelUpdateStatus?.lastApplyResult?.status === "failed" &&
          !panelApplyResultDismissed
        ) && (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Before You Restart</AlertTitle>
            <AlertDescription>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {panelUpdatePreflight.warnings.map((w, i) => (
                  <li key={`wrn-${i}`} className="break-words">
                    {w}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

      <UpdateActionButtons
        panelUpdateStatus={panelUpdateStatus}
        panelUpdatePreflight={panelUpdatePreflight}
        checkingPanelUpdate={checkingPanelUpdate}
        downloadingPanelUpdate={downloadingPanelUpdate}
        dockerUpdateConfirmOpen={dockerUpdateConfirmOpen}
        setDockerUpdateConfirmOpen={setDockerUpdateConfirmOpen}
        panelUpdateReady={panelUpdateReady}
        isDockerPanelUpdate={isDockerPanelUpdate}
        handleCheckPanelUpdate={handleCheckPanelUpdate}
        handleDownloadPanelUpdate={handleDownloadPanelUpdate}
        isDirty={isDirty}
        restarting={restarting}
        restartPanelWithReconnect={restartPanelWithReconnect}
      />

      <p className="text-xs text-muted-foreground">
        {isDirty
          ? "Save settings before applying an update."
          : panelUpdateReady
            ? "Update files are ready. Restart to switch to the new version."
            : panelUpdateStatus?.updateAvailable
              ? isDockerPanelUpdate
                ? "Applying this update saves and stops Project Zomboid, then rebuilds and recreates the all-in-one container."
                : "Download the update, then restart to apply it."
              : "No update is ready to install."}
      </p>

      <p className="text-xs text-muted-foreground">
        {isDockerPanelUpdate
          ? "Docker updates are handled by the configured host controller."
          : "Auto-update works in packaged builds only. In dev mode, update from git."}
      </p>
    </div>
  );
}
