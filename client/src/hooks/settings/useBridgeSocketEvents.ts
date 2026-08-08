import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import { BridgeStatus } from "@/lib/bridgeTypes";

// Real-time PanelBridge push updates (status flips, mod heartbeat,
// manual-configure confirmation). Split out of useBridgeStatus purely to
// keep that file under the size limit — this only ever runs alongside it.
export function useBridgeSocketEvents(
  socket: Socket | null,
  setBridgeStatus: (
    updater: (prev: BridgeStatus | null) => BridgeStatus | null,
  ) => void,
  fetchBridgeStatus: () => Promise<void>,
) {
  // Use ref to avoid stale closure issues with fetchBridgeStatus
  const fetchBridgeStatusRef = useRef(fetchBridgeStatus);
  useEffect(() => {
    fetchBridgeStatusRef.current = fetchBridgeStatus;
  }, [fetchBridgeStatus]);

  useEffect(() => {
    if (!socket) return;

    const handleBridgeStatus = (data: {
      isRunning: boolean;
      bridgePath: string;
    }) => {
      setBridgeStatus((prev) =>
        prev
          ? { ...prev, isRunning: data.isRunning, bridgePath: data.bridgePath }
          : null,
      );
      fetchBridgeStatusRef.current();
    };

    const handleModStatus = (data: {
      alive: boolean;
      version?: string;
      serverName?: string;
      playerCount?: number;
      players?: string[] | Record<string, unknown>;
      path?: string;
      timestamp?: number;
    }) => {
      setBridgeStatus((prev) => {
        if (!prev) return null;
        const prevModStatus = prev.modStatus;
        const newModStatus = {
          alive: data.alive,
          version: data.version || prevModStatus?.version || "",
          serverName: data.serverName || prevModStatus?.serverName || "",
          playerCount: data.alive ? (data.playerCount ?? 0) : undefined,
          players: Array.isArray(data.players)
            ? data.players
            : Object.keys(data.players || {}),
          path: data.path || prevModStatus?.path || "",
          timestamp: data.timestamp || Date.now(),
        };
        return { ...prev, modConnected: data.alive, modStatus: newModStatus };
      });
    };

    const handleBridgeConfigured = (data: { bridgePath: string }) => {
      setBridgeStatus((prev) =>
        prev
          ? { ...prev, bridgePath: data.bridgePath, configured: true }
          : null,
      );
      fetchBridgeStatusRef.current();
    };

    socket.on("panelBridge:status", handleBridgeStatus);
    socket.on("panelBridge:modStatus", handleModStatus);
    socket.on("panelBridge:configured", handleBridgeConfigured);

    return () => {
      socket.off("panelBridge:status", handleBridgeStatus);
      socket.off("panelBridge:modStatus", handleModStatus);
      socket.off("panelBridge:configured", handleBridgeConfigured);
    };
  }, [socket, setBridgeStatus]); // Use ref for fetchBridgeStatus to avoid resubscribing
}
