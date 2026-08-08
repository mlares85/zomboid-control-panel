import { useCallback, useEffect, useState } from "react";
import { panelBridgeApi, serversApi, ServerInstance } from "@/lib/api";
import { reportClientError } from "@/lib/client-errors";
import { useToast } from "@/components/ui/use-toast";

// Installing PanelBridge.lua onto a server, and the server-picker dropdown
// used by both this and the RCON connection summary on the Bridge tab.
export function useBridgeInstall() {
  const { toast } = useToast();
  const [servers, setServers] = useState<ServerInstance[]>([]);
  const [selectedInstallServerId, setSelectedInstallServerId] =
    useState<string>("");
  const [installingMod, setInstallingMod] = useState(false);

  const fetchServers = useCallback(async () => {
    try {
      const data = await serversApi.getAll();
      setServers(data.servers || []);
      // Auto-select active server
      const activeServer = data.servers?.find((s) => s.isActive);
      if (activeServer && !selectedInstallServerId) {
        setSelectedInstallServerId(String(activeServer.id));
      }
    } catch (error) {
      reportClientError("Failed to fetch servers.", error);
    }
  }, [selectedInstallServerId]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const handleInstallMod = async () => {
    if (!selectedInstallServerId) {
      toast({
        title: "Select a Server",
        description:
          "Choose the server where you want to install PanelBridge.lua.",
        variant: "destructive",
      });
      return;
    }

    setInstallingMod(true);
    try {
      const result = await panelBridgeApi.installModAuto(
        selectedInstallServerId,
      );
      toast({
        title: "PanelBridge Installed",
        description: `PanelBridge.lua was copied to ${result.serverName || "the selected server"}.`,
        variant: "success" as const,
      });
    } catch (error) {
      toast({
        title: "Installation Failed",
        description:
          error instanceof Error
            ? error.message
            : "The panel could not copy PanelBridge.lua. Verify the server path and permissions, then try again.",
        variant: "destructive",
      });
    } finally {
      setInstallingMod(false);
    }
  };

  const selectedInstallServer =
    servers.find((server) => String(server.id) === selectedInstallServerId) ||
    null;
  const activeServer = servers.find((server) => server.isActive) || null;

  // Detect path separator from install path; default to '/' (works everywhere)
  const sep = selectedInstallServer?.installPath?.includes("\\") ? "\\" : "/";
  const selectedInstallTarget = selectedInstallServer
    ? `${selectedInstallServer.installPath}${sep}media${sep}lua${sep}server${sep}PanelBridge.lua`
    : null;

  return {
    servers,
    selectedInstallServerId,
    setSelectedInstallServerId,
    installingMod,
    handleInstallMod,
    selectedInstallServer,
    activeServer,
    selectedInstallTarget,
  };
}
