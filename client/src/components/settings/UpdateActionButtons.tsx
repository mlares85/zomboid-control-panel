import { Download, ExternalLink, Loader2, RefreshCw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PanelUpdatePreflight, PanelUpdateStatus } from "@/lib/api";

interface UpdateActionButtonsProps {
  panelUpdateStatus: PanelUpdateStatus | null;
  panelUpdatePreflight: PanelUpdatePreflight | null;
  checkingPanelUpdate: boolean;
  downloadingPanelUpdate: boolean;
  dockerUpdateConfirmOpen: boolean;
  setDockerUpdateConfirmOpen: (open: boolean) => void;
  panelUpdateReady: boolean;
  isDockerPanelUpdate: boolean;
  handleCheckPanelUpdate: () => Promise<void>;
  handleDownloadPanelUpdate: () => Promise<void>;
  isDirty: boolean;
  restarting: boolean;
  restartPanelWithReconnect: (description: string) => Promise<void>;
}

// Check / download / restart-and-apply controls, plus their confirmation
// dialogs. Split out from UpdatesSettings to keep that file readable.
export function UpdateActionButtons({
  panelUpdateStatus,
  panelUpdatePreflight,
  checkingPanelUpdate,
  downloadingPanelUpdate,
  dockerUpdateConfirmOpen,
  setDockerUpdateConfirmOpen,
  panelUpdateReady,
  isDockerPanelUpdate,
  handleCheckPanelUpdate,
  handleDownloadPanelUpdate,
  isDirty,
  restarting,
  restartPanelWithReconnect,
}: UpdateActionButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={handleCheckPanelUpdate}
        disabled={checkingPanelUpdate || downloadingPanelUpdate || restarting}
        className="gap-2"
      >
        {checkingPanelUpdate ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
        {checkingPanelUpdate ? "Checking..." : "Check for Updates"}
      </Button>

      {isDockerPanelUpdate ? (
        <AlertDialog
          open={dockerUpdateConfirmOpen}
          onOpenChange={setDockerUpdateConfirmOpen}
        >
          <AlertDialogTrigger asChild>
            <Button
              disabled={
                !panelUpdateStatus?.updateAvailable ||
                checkingPanelUpdate ||
                downloadingPanelUpdate ||
                restarting ||
                panelUpdatePreflight?.ok === false
              }
              className="gap-2"
            >
              {downloadingPanelUpdate ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {downloadingPanelUpdate
                ? "Applying Docker Update..."
                : "Apply Docker Update"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apply Docker update?</AlertDialogTitle>
              <AlertDialogDescription>
                The panel will save and stop Project Zomboid through RCON,
                then rebuild and recreate the all-in-one container. Players
                will be disconnected while the panel comes back online.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setDockerUpdateConfirmOpen(false);
                  handleDownloadPanelUpdate();
                }}
              >
                Stop server and update
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Button
          onClick={handleDownloadPanelUpdate}
          disabled={
            !panelUpdateStatus?.updateAvailable ||
            checkingPanelUpdate ||
            downloadingPanelUpdate ||
            restarting ||
            panelUpdatePreflight?.ok === false
          }
          className="gap-2"
        >
          {downloadingPanelUpdate ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {downloadingPanelUpdate ? "Downloading..." : "Download Update"}
        </Button>
      )}

      {!isDockerPanelUpdate && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="warning"
              disabled={
                !panelUpdateReady ||
                restarting ||
                isDirty ||
                downloadingPanelUpdate ||
                Boolean(panelUpdateStatus?.isDownloading) ||
                panelUpdatePreflight?.ok === false
              }
              className="gap-2"
            >
              {restarting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCw className="w-4 h-4" />
              )}
              Restart and Apply Update
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apply panel update?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm">
                  <p>
                    The panel will exit immediately. A helper process will
                    swap the executable and relaunch it in a few seconds.
                    {panelUpdateStatus?.stagedUpdate?.version
                      ? ` You are about to install v${panelUpdateStatus.stagedUpdate.version}.`
                      : ""}
                  </p>
                  {panelUpdatePreflight?.warnings.length ? (
                    <div>
                      <p className="font-medium text-foreground">
                        Please confirm before continuing:
                      </p>
                      <ul className="mt-1 list-disc space-y-1 pl-5">
                        {panelUpdatePreflight.warnings.map((w, i) => (
                          <li key={`confirm-wrn-${i}`} className="break-words">
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    If the new version does not come back online within a
                    minute, check the helper log in <code>%TEMP%</code>(
                    <code>zomboid-panel-update-*.log</code>) and relaunch the
                    panel manually.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  restartPanelWithReconnect(
                    "Applying downloaded update. Restarting panel...",
                  )
                }
              >
                Restart and apply
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {panelUpdateStatus?.releaseUrl && (
        <Button asChild variant="ghost" className="gap-2">
          <a
            href={panelUpdateStatus.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="max-w-full truncate"
            title={panelUpdateStatus.releaseUrl}
          >
            <ExternalLink className="h-4 w-4" />
            View Release Notes <span className="sr-only">(opens in new tab)</span>
          </a>
        </Button>
      )}
    </div>
  );
}
