import { useState } from "react";
import { panelBridgeApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { AppSettings } from "@/lib/settingsTypes";

// PanelBridge SFTP transport: remote log tailing and remote Server-config
// folder discovery, used for servers the panel can't reach on the local
// filesystem.
export function useBridgeRemote(
  settings: AppSettings,
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void,
) {
  const { toast } = useToast();
  const [testingSftp, setTestingSftp] = useState(false);
  const [remoteLogs, setRemoteLogs] = useState<
    Array<{ name: string; size: number; modifiedAt: string | null }>
  >([]);
  const [remoteLogContent, setRemoteLogContent] = useState<{
    name: string;
    content: string;
    truncated: boolean;
    bytesReturned: number;
  } | null>(null);
  const [loadingRemoteLogs, setLoadingRemoteLogs] = useState(false);
  const [remoteLogError, setRemoteLogError] = useState<string | null>(null);
  const [remoteConfigFiles, setRemoteConfigFiles] = useState<
    Array<{ name: string; size: number; modifiedAt: string | null }>
  >([]);
  const [loadingRemoteConfig, setLoadingRemoteConfig] = useState(false);
  const [remoteConfigError, setRemoteConfigError] = useState<string | null>(
    null,
  );

  const sftpConfig = () => ({
    host: settings.panelBridgeSftpHost,
    port: settings.panelBridgeSftpPort,
    username: settings.panelBridgeSftpUsername,
    password: settings.panelBridgeSftpPassword,
    bridgePath: settings.panelBridgeSftpBridgePath,
    pollIntervalSeconds: settings.panelBridgeSftpPollIntervalSeconds,
  });

  const handleListRemoteLogs = async () => {
    setLoadingRemoteLogs(true);
    setRemoteLogError(null);
    try {
      const result = await panelBridgeApi.listSftpLogs({
        ...sftpConfig(),
        logPath: settings.panelBridgeSftpLogPath,
      });
      setRemoteLogs(result.files || []);
      if (!result.files?.length) {
        setRemoteLogError("No .txt or .log files found in that folder.");
      }
    } catch (error) {
      setRemoteLogs([]);
      setRemoteLogError(
        error instanceof Error ? error.message : "Could not list remote logs.",
      );
    } finally {
      setLoadingRemoteLogs(false);
    }
  };

  const handleCheckRemoteConfig = async () => {
    setLoadingRemoteConfig(true);
    setRemoteConfigError(null);
    try {
      const result = await panelBridgeApi.listSftpConfigFiles({
        ...sftpConfig(),
        configPath: settings.panelBridgeSftpConfigPath,
      });
      setRemoteConfigFiles(result.files || []);
      if (!result.files?.length) {
        setRemoteConfigError(
          "No .ini or .lua files found in that folder. Check the path points at the server's Server folder.",
        );
      }
    } catch (error) {
      setRemoteConfigFiles([]);
      setRemoteConfigError(
        error instanceof Error
          ? error.message
          : "Could not read the remote config folder.",
      );
    } finally {
      setLoadingRemoteConfig(false);
    }
  };

  const handleTailRemoteLog = async (name: string) => {
    setLoadingRemoteLogs(true);
    setRemoteLogError(null);
    try {
      const result = await panelBridgeApi.tailSftpLog({
        ...sftpConfig(),
        logPath: settings.panelBridgeSftpLogPath,
        name,
      });
      setRemoteLogContent({
        name: result.name,
        content: result.content,
        truncated: result.truncated,
        bytesReturned: result.bytesReturned,
      });
    } catch (error) {
      setRemoteLogContent(null);
      setRemoteLogError(
        error instanceof Error ? error.message : "Could not read that log file.",
      );
    } finally {
      setLoadingRemoteLogs(false);
    }
  };

  const handleTestSftp = async () => {
    setTestingSftp(true);
    try {
      const result = await panelBridgeApi.testSftp(sftpConfig());
      toast({
        title: "SFTP Connected",
        description: result.statusExists
          ? `Bridge status found, ${result.latencyMs} ms round trip.`
          : `Connected in ${result.latencyMs} ms. Start the PZ server to create status.json.`,
        variant: "success" as const,
      });
    } catch (error) {
      toast({
        title: "SFTP Test Failed",
        description:
          error instanceof Error ? error.message : "Could not connect to SFTP.",
        variant: "destructive",
      });
    } finally {
      setTestingSftp(false);
    }
  };

  // Configuring the SFTP bridge reuses the bridge-status busy/error state so
  // the "Start SFTP bridge" button disables alongside every other bridge
  // control, and a fresh status is fetched immediately after.
  const handleConfigureSftp = async (bridge: {
    setBridgeLoading: (value: boolean) => void;
    setBridgeError: (value: string | null) => void;
    fetchBridgeStatus: () => Promise<void>;
  }) => {
    bridge.setBridgeLoading(true);
    bridge.setBridgeError(null);
    try {
      await panelBridgeApi.configureSftp(sftpConfig());
      updateSetting("panelBridgeSftpEnabled", true);
      toast({
        title: "SFTP Bridge Started",
        description: "PanelBridge is syncing through the local cache.",
        variant: "success" as const,
      });
      await bridge.fetchBridgeStatus();
    } catch (error) {
      bridge.setBridgeError(
        error instanceof Error ? error.message : "Could not start the SFTP bridge.",
      );
    } finally {
      bridge.setBridgeLoading(false);
    }
  };

  return {
    testingSftp,
    handleTestSftp,
    handleConfigureSftp,
    remoteLogs,
    remoteLogContent,
    loadingRemoteLogs,
    remoteLogError,
    handleListRemoteLogs,
    handleTailRemoteLog,
    remoteConfigFiles,
    loadingRemoteConfig,
    remoteConfigError,
    handleCheckRemoteConfig,
  };
}
