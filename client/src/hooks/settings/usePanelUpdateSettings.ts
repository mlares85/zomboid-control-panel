import { useCallback, useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { panelUpdateApi, PanelUpdateStatus, PanelUpdatePreflight } from "@/lib/api";
import { reportClientError } from "@/lib/client-errors";
import { useToast } from "@/components/ui/use-toast";
import { usePanelUpdateSocketEvents } from "./usePanelUpdateSocketEvents";

// Panel auto-update tab: release status, download/apply flow, and the
// socket events pushed by the update service. Shared with the About tab,
// which just displays the installed/latest version.
export function usePanelUpdateSettings(socket: Socket | null) {
  const { toast } = useToast();
  const [panelUpdateStatus, setPanelUpdateStatus] =
    useState<PanelUpdateStatus | null>(null);
  const [panelUpdateStatusError, setPanelUpdateStatusError] = useState<
    string | null
  >(null);
  const [checkingPanelUpdate, setCheckingPanelUpdate] = useState(false);
  const [downloadingPanelUpdate, setDownloadingPanelUpdate] = useState(false);
  const [dockerUpdateConfirmOpen, setDockerUpdateConfirmOpen] = useState(false);
  const [panelUpdateReady, setPanelUpdateReady] = useState(false);
  const [panelUpdatePreflight, setPanelUpdatePreflight] =
    useState<PanelUpdatePreflight | null>(null);
  const [panelApplyLog, setPanelApplyLog] = useState<string | null>(null);
  const [panelApplyResultDismissed, setPanelApplyResultDismissed] =
    useState(false);

  const fetchPanelUpdateStatus = useCallback(async () => {
    try {
      const status = await panelUpdateApi.getStatus();
      setPanelUpdateStatus(status);
      setPanelUpdateStatusError(null);
      // "Ready to apply" reflects whether a binary is staged on disk, not
      // just whether the last click finished. Survives page reloads.
      if (status.stagedUpdate) {
        setPanelUpdateReady(true);
      } else if (!status.updateAvailable) {
        setPanelUpdateReady(false);
      }
      // If a previous apply failed, surface the helper log right away so
      // the user can see what happened without clicking anything.
      if (status.lastApplyResult?.status === "failed") {
        if (status.lastApplyResult.helperLog) {
          setPanelApplyLog(status.lastApplyResult.helperLog);
        } else {
          try {
            const { log: helperLog } = await panelUpdateApi.getApplyLog();
            setPanelApplyLog(helperLog);
          } catch {
            setPanelApplyLog(null);
          }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not load updater status";
      setPanelUpdateStatusError(message);
      reportClientError("Failed to fetch panel update status.", error);
    }
  }, []);

  const fetchPanelUpdatePreflight = useCallback(async () => {
    try {
      const pre = await panelUpdateApi.preflight();
      setPanelUpdatePreflight(pre);
      return pre;
    } catch (error) {
      reportClientError("Failed to fetch panel update preflight.", error);
      return null;
    }
  }, []);

  useEffect(() => {
    fetchPanelUpdateStatus();
  }, [fetchPanelUpdateStatus]);

  const hasActionablePanelUpdate = Boolean(
    panelUpdateStatus?.updateAvailable || panelUpdateStatus?.stagedUpdate,
  );
  const isDockerPanelUpdate = panelUpdateStatus?.updateMode === "docker";
  const stagedPanelUpdatePath = panelUpdateStatus?.stagedUpdate?.path;

  // Run preflight once status tells us we're in a packaged build and there
  // is anything actionable (either an available update or a staged file).
  useEffect(() => {
    if (!hasActionablePanelUpdate) return;
    fetchPanelUpdatePreflight();
  }, [
    hasActionablePanelUpdate,
    stagedPanelUpdatePath,
    fetchPanelUpdatePreflight,
  ]);

  usePanelUpdateSocketEvents({
    socket,
    setPanelUpdateStatus,
    setPanelUpdateReady,
    setPanelUpdateStatusError,
    setPanelApplyResultDismissed,
    setPanelApplyLog,
    fetchPanelUpdateStatus,
  });

  const handleCheckPanelUpdate = async () => {
    setCheckingPanelUpdate(true);
    setPanelUpdateStatusError(null);
    try {
      const status = await panelUpdateApi.check();
      setPanelUpdateStatus(status);

      if (status.updateAvailable) {
        toast({
          title: "Update Available",
          description: `A newer panel version is available: v${status.latestVersion} (installed: v${status.currentVersion}).`,
        });
      } else {
        setPanelUpdateReady(false);
        toast({
          title: "Up to Date",
          description: `You are running the latest panel release (v${status.currentVersion}).`,
          variant: "success" as const,
        });
      }
    } catch (error) {
      toast({
        title: "Update Check Failed",
        description:
          error instanceof Error
            ? error.message
            : "The panel could not reach GitHub. Check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setCheckingPanelUpdate(false);
    }
  };

  const handleDownloadPanelUpdate = async () => {
    if (!panelUpdateStatus?.updateAvailable) {
      toast({
        title: "No Update Available",
        description:
          "No newer release was found. Run Check for Updates to refresh status.",
      });
      return;
    }

    setDownloadingPanelUpdate(true);
    setPanelUpdateStatusError(null);
    try {
      // Pre-flight before touching disk — refuse early if apply would fail.
      const pre = await fetchPanelUpdatePreflight();
      if (pre && !pre.ok) {
        throw new Error(
          pre.blockers[0] || "Update blocked by preflight check.",
        );
      }

      const result = await panelUpdateApi.download(isDockerPanelUpdate);
      if (!result.success) {
        if (result.preflight) setPanelUpdatePreflight(result.preflight);
        throw new Error(
          result.error || result.message || "Update download failed",
        );
      }

      if (!isDockerPanelUpdate) setPanelUpdateReady(true);
      toast({
        title: isDockerPanelUpdate ? "Docker Update Started" : "Update Downloaded",
        description:
          result.message ||
          isDockerPanelUpdate
            ? "The panel container is rebuilding and will reconnect when the health check passes."
            : "The update files are ready. Restart the panel to apply this version.",
        variant: "success" as const,
      });
      await fetchPanelUpdateStatus();
    } catch (error) {
      toast({
        title: "Download Failed",
        description:
          error instanceof Error
            ? error.message
            : "The panel could not download the update. Check network access, disk space, and permissions.",
        variant: "destructive",
      });
    } finally {
      setDownloadingPanelUpdate(false);
    }
  };

  return {
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
  };
}
