import { useCallback, useEffect, useState } from "react";
import { configApi, serverApi } from "@/lib/api";
import { reportClientError } from "@/lib/client-errors";
import { useToast } from "@/components/ui/use-toast";
import { AppSettings, CorsDiagnostics } from "@/lib/settingsTypes";

// Remote access (CORS) tab: diagnostics, reload/clear actions, the LAN
// network-interface list, and the "don't lock yourself out" confirm flow.
export function useCorsSettings(
  settings: AppSettings,
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void,
) {
  const { toast } = useToast();
  const [corsDiagnostics, setCorsDiagnostics] =
    useState<CorsDiagnostics | null>(null);
  const [corsLoading, setCorsLoading] = useState(false);
  const [corsUpdating, setCorsUpdating] = useState(false);
  const [networkInterfaces, setNetworkInterfaces] = useState<
    { name: string; address: string }[]
  >([]);
  const [pendingCorsLanDisable, setPendingCorsLanDisable] = useState(false);

  const fetchCorsDiagnostics = useCallback(async () => {
    setCorsLoading(true);
    try {
      const data = await configApi.getCorsDiagnostics();
      setCorsDiagnostics(data.diagnostics);
    } catch (error) {
      reportClientError("Failed to fetch CORS diagnostics.", error);
    } finally {
      setCorsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCorsDiagnostics();
  }, [fetchCorsDiagnostics]);

  useEffect(() => {
    serverApi
      .getNetworkInterfaces()
      .then((data) => setNetworkInterfaces(data.interfaces || []))
      .catch(() => setNetworkInterfaces([]));
  }, []);

  const handleReloadCorsRules = async () => {
    setCorsUpdating(true);
    try {
      const data = await configApi.reloadCorsDiagnostics();
      setCorsDiagnostics(data.diagnostics);
      toast({
        title: "CORS Rules Reloaded",
        description: "The backend reloaded CORS settings from the database.",
        variant: "success" as const,
      });
    } catch (error) {
      toast({
        title: "Could Not Reload CORS Rules",
        description:
          error instanceof Error
            ? error.message
            : "Failed to reload CORS rules.",
        variant: "destructive",
      });
    } finally {
      setCorsUpdating(false);
    }
  };

  const handleClearCorsBlocked = async () => {
    setCorsUpdating(true);
    try {
      const data = await configApi.clearCorsBlockedOrigins();
      setCorsDiagnostics(data.diagnostics);
      toast({
        title: "Blocked Origin Log Cleared",
        description:
          "Recent blocked CORS origins were removed from diagnostics.",
        variant: "success" as const,
      });
    } catch (error) {
      toast({
        title: "Could Not Clear Log",
        description:
          error instanceof Error
            ? error.message
            : "Failed to clear blocked CORS origins.",
        variant: "destructive",
      });
    } finally {
      setCorsUpdating(false);
    }
  };

  // Lock-out guard: if the user disables "Allow Private/LAN Origins" while
  // "Allow All" is also off and the explicit allow-list is empty, the panel
  // will reject every browser request after the next CORS reload —
  // including theirs. Confirm before letting that through.
  const handleCorsLanToggle = (value: boolean) => {
    if (
      !value &&
      !settings.corsAllowAll &&
      !settings.corsAllowedOrigins.trim()
    ) {
      setPendingCorsLanDisable(true);
      return;
    }
    updateSetting("corsAllowPrivateNetworks", value);
  };

  return {
    corsDiagnostics,
    corsLoading,
    corsUpdating,
    networkInterfaces,
    fetchCorsDiagnostics,
    handleReloadCorsRules,
    handleClearCorsBlocked,
    pendingCorsLanDisable,
    setPendingCorsLanDisable,
    handleCorsLanToggle,
  };
}
