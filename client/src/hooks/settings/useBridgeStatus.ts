import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { panelBridgeApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { BridgeStatus } from "@/lib/bridgeTypes";
import { useBridgeSocketEvents } from "./useBridgeSocketEvents";

export type { BridgeStatus } from "@/lib/bridgeTypes";

// PanelBridge connection lifecycle: status polling, socket push updates,
// and the auto/manual/stop controls. Split out from the SFTP transport and
// mod-install concerns so each stays under the file size limit.
export function useBridgeStatus(socket: Socket | null) {
  const { toast } = useToast();
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);
  const [manualBridgePath, setManualBridgePath] = useState("");

  const fetchBridgeStatus = useCallback(async () => {
    try {
      const status = await panelBridgeApi.getStatus();
      setBridgeStatus(status);
      setBridgeError(null);
    } catch {
      // Non-fatal — the status card just shows stale data until the next poll.
    }
  }, []);

  // Use ref for bridge polling interval to avoid recreation issues
  const bridgeStatusRef = useRef(bridgeStatus);
  useEffect(() => {
    bridgeStatusRef.current = bridgeStatus;
  }, [bridgeStatus]);

  useEffect(() => {
    fetchBridgeStatus();

    // Use recursive setTimeout for adaptive interval based on current status
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextFetch = () => {
      const status = bridgeStatusRef.current;
      // Poll faster when waiting for mod to connect
      const interval =
        status?.isRunning && !status?.modConnected ? 3000 : 10000;

      timeoutId = setTimeout(async () => {
        if (document.visibilityState !== "hidden") {
          await fetchBridgeStatus();
        }
        scheduleNextFetch();
      }, interval);
    };

    scheduleNextFetch();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
  }, [fetchBridgeStatus]);

  useBridgeSocketEvents(socket, setBridgeStatus, fetchBridgeStatus);

  const handleAutoConfigure = async () => {
    setBridgeLoading(true);
    setBridgeError(null);
    try {
      const result = await panelBridgeApi.autoConfigure();
      if (result.success) {
        toast({
          title: "Bridge Auto-Configured",
          description: `Connected to server: ${result.serverName}`,
          variant: "success" as const,
        });
        await fetchBridgeStatus();
      } else {
        setBridgeError(result.error || "Failed to auto-configure");
      }
    } catch (error) {
      setBridgeError(
        error instanceof Error ? error.message : "Failed to auto-configure",
      );
    } finally {
      setBridgeLoading(false);
    }
  };

  const handleStopBridge = async () => {
    setBridgeLoading(true);
    try {
      await panelBridgeApi.stop();
      toast({
        title: "Bridge Stopped",
        description: "Panel Bridge has been stopped",
        variant: "success" as const,
      });
      await fetchBridgeStatus();
    } catch (error) {
      toast({
        title: "Failed to Stop",
        description:
          error instanceof Error
            ? error.message
            : "The panel could not stop Panel Bridge. Try again.",
        variant: "destructive",
      });
    } finally {
      setBridgeLoading(false);
    }
  };

  const handleManualConfigure = async () => {
    const trimmed = manualBridgePath.trim();
    if (!trimmed) return;
    setBridgeLoading(true);
    setBridgeError(null);
    try {
      const result = await panelBridgeApi.configureDirect(trimmed);
      if (result.success) {
        toast({
          title: "Bridge Configured",
          description: `Watching: ${result.bridgePath}`,
          variant: "success" as const,
        });
        setManualBridgePath("");
        await fetchBridgeStatus();
      } else {
        setBridgeError(result.error || "Failed to configure bridge");
      }
    } catch (error) {
      setBridgeError(
        error instanceof Error
          ? error.message
          : "Failed to configure bridge with manual path",
      );
    } finally {
      setBridgeLoading(false);
    }
  };

  const handlePingMod = async () => {
    setPinging(true);
    try {
      const result = await panelBridgeApi.ping();
      if (result.success) {
        toast({
          title: "Mod Connected!",
          description: `Connected to ${result.modStatus?.serverName || "server"}`,
          variant: "success" as const,
        });
      } else {
        toast({
          title: "Mod Did Not Respond",
          description:
            result.error ||
            "No response from PanelBridge.lua. Make sure the game server is running and the mod is enabled.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Ping Failed",
        description:
          error instanceof Error
            ? error.message
            : "The panel could not ping the mod. Confirm the server is running with PanelBridge enabled.",
        variant: "destructive",
      });
    } finally {
      setPinging(false);
    }
  };

  return {
    bridgeStatus,
    bridgeLoading,
    setBridgeLoading,
    bridgeError,
    setBridgeError,
    pinging,
    manualBridgePath,
    setManualBridgePath,
    fetchBridgeStatus,
    handleAutoConfigure,
    handleStopBridge,
    handleManualConfigure,
    handlePingMod,
  };
}
