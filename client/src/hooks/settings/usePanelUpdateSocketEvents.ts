import { useEffect } from "react";
import type { Socket } from "socket.io-client";
import { PanelUpdateStatus } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";

interface PanelUpdateSocketEventsDeps {
  socket: Socket | null;
  setPanelUpdateStatus: (
    updater: (prev: PanelUpdateStatus | null) => PanelUpdateStatus | null,
  ) => void;
  setPanelUpdateReady: (value: boolean) => void;
  setPanelUpdateStatusError: (value: string | null) => void;
  setPanelApplyResultDismissed: (value: boolean) => void;
  setPanelApplyLog: (value: string | null) => void;
  fetchPanelUpdateStatus: () => Promise<void>;
}

// Real-time push updates for the panel updater: availability, download
// progress, and apply results. Split out of usePanelUpdateSettings purely
// to keep that file under the size limit — this only ever runs alongside it.
export function usePanelUpdateSocketEvents({
  socket,
  setPanelUpdateStatus,
  setPanelUpdateReady,
  setPanelUpdateStatusError,
  setPanelApplyResultDismissed,
  setPanelApplyLog,
  fetchPanelUpdateStatus,
}: PanelUpdateSocketEventsDeps) {
  const { toast } = useToast();

  useEffect(() => {
    if (!socket) return;

    const handlePanelUpdateAvailable = (data: {
      latestVersion?: string;
      currentVersion?: string;
      releaseUrl?: string;
    }) => {
      setPanelUpdateStatus((prev) => {
        const base: PanelUpdateStatus = prev || {
          currentVersion: data.currentVersion || "Unknown",
          updateAvailable: true,
          latestVersion: data.latestVersion || null,
          releaseUrl: data.releaseUrl || null,
          releaseNotes: null,
          publishedAt: null,
          isChecking: false,
          isDownloading: false,
          downloadProgress: 0,
          lastCheck: new Date().toISOString(),
          lastError: null,
          stagedUpdate: null,
          lastApplyResult: null,
        };
        return {
          ...base,
          updateAvailable: true,
          latestVersion: data.latestVersion || base.latestVersion,
          currentVersion: data.currentVersion || base.currentVersion,
          releaseUrl: data.releaseUrl || base.releaseUrl,
          lastError: null,
        };
      });
    };

    const handlePanelDownloadProgress = (data: {
      progress?: number;
      status?: string;
    }) => {
      setPanelUpdateStatus((prev) => {
        const base: PanelUpdateStatus = prev || {
          currentVersion: "Unknown",
          updateAvailable: true,
          latestVersion: null,
          releaseUrl: null,
          releaseNotes: null,
          publishedAt: null,
          isChecking: false,
          isDownloading: false,
          downloadProgress: 0,
          lastCheck: null,
          lastError: null,
          stagedUpdate: null,
          lastApplyResult: null,
        };
        const bounded = Math.max(
          0,
          Math.min(100, data.progress ?? base.downloadProgress),
        );
        return {
          ...base,
          isDownloading:
            data.status === "downloading" || data.status === "preparing",
          downloadProgress: bounded,
        };
      });
    };

    const handlePanelUpdateReady = (data: { version?: string }) => {
      setPanelUpdateReady(true);
      toast({
        title: "Update Ready",
        description: data.version
          ? `Panel v${data.version} is downloaded. Restart the panel to switch to the new version.`
          : "The update is downloaded. Restart the panel to switch to the new version.",
        variant: "success" as const,
      });
      setPanelUpdateStatusError(null);
      fetchPanelUpdateStatus();
    };

    const handlePanelUpdateApplied = (data: { version?: string }) => {
      setPanelUpdateReady(false);
      setPanelApplyResultDismissed(false);
      setPanelApplyLog(null);
      toast({
        title: "Update Applied",
        description: data.version
          ? `Panel successfully updated to v${data.version}.`
          : "Panel update applied successfully.",
        variant: "success" as const,
      });
      fetchPanelUpdateStatus();
    };

    const handlePanelUpdateApplyFailed = (data: {
      pendingVersion?: string;
      helperLog?: string | null;
    }) => {
      setPanelApplyResultDismissed(false);
      if (data?.helperLog) setPanelApplyLog(data.helperLog);
      toast({
        title: "Update Failed to Apply",
        description: data?.pendingVersion
          ? `Panel is still running the previous version. The v${data.pendingVersion} update did not install.`
          : "The downloaded update did not install. Review the helper log for details.",
        variant: "destructive",
      });
      fetchPanelUpdateStatus();
    };

    socket.on("panel:updateAvailable", handlePanelUpdateAvailable);
    socket.on("panel:downloadProgress", handlePanelDownloadProgress);
    socket.on("panel:updateReady", handlePanelUpdateReady);
    socket.on("panel:updateApplied", handlePanelUpdateApplied);
    socket.on("panel:updateApplyFailed", handlePanelUpdateApplyFailed);

    return () => {
      socket.off("panel:updateAvailable", handlePanelUpdateAvailable);
      socket.off("panel:downloadProgress", handlePanelDownloadProgress);
      socket.off("panel:updateReady", handlePanelUpdateReady);
      socket.off("panel:updateApplied", handlePanelUpdateApplied);
      socket.off("panel:updateApplyFailed", handlePanelUpdateApplyFailed);
    };
  }, [
    socket,
    toast,
    fetchPanelUpdateStatus,
    setPanelUpdateStatus,
    setPanelUpdateReady,
    setPanelUpdateStatusError,
    setPanelApplyResultDismissed,
    setPanelApplyLog,
  ]);
}
