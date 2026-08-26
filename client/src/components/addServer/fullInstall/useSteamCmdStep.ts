import { useState, useContext, useEffect } from "react";
import { configApi, serverApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { SocketContext } from "@/contexts/SocketContext";
import { reportClientError } from "@/lib/client-errors";

// Step 1 state: SteamCMD detection, manual path, and auto-download.
// Owns its own socket subscriptions for steamcmd:status / steamcmd:log.
export function useSteamCmdStep() {
  const [steamCmdPath, setSteamCmdPath] = useState("");
  const [hasSteamCmd, setHasSteamCmd] = useState(false);
  const [downloadingSteamCmd, setDownloadingSteamCmd] = useState(false);
  const [steamCmdStatus, setSteamCmdStatus] = useState("");

  const { toast } = useToast();
  const socket = useContext(SocketContext);

  useEffect(() => {
    if (!socket) return;

    const handleSteamCmdStatus = (data: { status: string; message: string; path?: string }) => {
      setSteamCmdStatus(data.message);
      if (data.status === "complete" && data.path) {
        setSteamCmdPath(data.path);
        setHasSteamCmd(true);
        setDownloadingSteamCmd(false);
        toast({ title: "SteamCMD Ready", description: "SteamCMD is installed and ready to use." });
      } else if (data.status === "error") {
        setDownloadingSteamCmd(false);
        toast({ title: "SteamCMD Setup Failed", description: data.message, variant: "destructive" });
      }
    };

    const handleSteamCmdLog = (data: { type: string; text: string }) => {
      setSteamCmdStatus(data.text.trim());
    };

    socket.on("steamcmd:status", handleSteamCmdStatus);
    socket.on("steamcmd:log", handleSteamCmdLog);
    return () => {
      socket.off("steamcmd:status", handleSteamCmdStatus);
      socket.off("steamcmd:log", handleSteamCmdLog);
    };
  }, [socket, toast]);

  const handleDownloadSteamCmd = async () => {
    setDownloadingSteamCmd(true);
    setSteamCmdStatus("Starting download...");
    try {
      await serverApi.downloadSteamCmd(steamCmdPath);
    } catch (error) {
      setDownloadingSteamCmd(false);
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "Failed to start SteamCMD download.",
        variant: "destructive",
      });
    }
  };

  const handleSaveSteamCmdPath = async () => {
    try {
      await configApi.updateAppSettings({ steamcmdPath: steamCmdPath });
      setHasSteamCmd(true);
      toast({ title: "Path Saved", description: "SteamCMD path saved successfully." });
    } catch {
      toast({ title: "Save Failed", description: "Could not save SteamCMD path.", variant: "destructive" });
    }
  };

  const handleAutoDetectSteamCmd = async () => {
    try {
      const data = await serverApi.detectSteamCmd();
      if (data.found && data.path) {
        setSteamCmdPath(data.path);
        setHasSteamCmd(true);
        toast({ title: "SteamCMD Found", description: data.message });
      } else {
        // Pre-fill with server's suggested path so the user sees where it'll go
        if (data.suggestedPath && !steamCmdPath) {
          setSteamCmdPath(data.suggestedPath);
        }
        toast({ title: "SteamCMD Not Found", description: data.message });
      }
    } catch (error) {
      reportClientError("Failed to auto-detect SteamCMD.", error);
    }
  };

  // Load any previously saved SteamCMD path on mount, then auto-detect
  useEffect(() => {
    const loadSavedPath = async () => {
      try {
        const data = await configApi.getAppSettings();
        const settings = data.settings || {};
        if (settings.steamcmdPath) {
          setSteamCmdPath(settings.steamcmdPath);
          setHasSteamCmd(true);
          return; // Already configured — skip detect
        }
      } catch (error) {
        reportClientError("Failed to load settings.", error);
      }

      // No saved path — try auto-detect and pre-fill suggested path
      try {
        const detect = await serverApi.detectSteamCmd();
        if (detect.found && detect.path) {
          setSteamCmdPath(detect.path);
          setHasSteamCmd(true);
        } else if (detect.suggestedPath) {
          setSteamCmdPath(detect.suggestedPath);
        }
      } catch {
        // Non-critical — field stays empty
      }
    };
    loadSavedPath();
  }, []);

  return {
    steamCmdPath,
    setSteamCmdPath,
    hasSteamCmd,
    setHasSteamCmd,
    downloadingSteamCmd,
    steamCmdStatus,
    handleDownloadSteamCmd,
    handleSaveSteamCmdPath,
    handleAutoDetectSteamCmd,
  };
}
