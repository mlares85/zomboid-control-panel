import { FolderOpen, Link, Loader2 } from "lucide-react";
import { Link as RouterLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldHelp } from "@/components/FieldHelp";
import { AppSettings } from "@/lib/settingsTypes";
import { BridgeStatus } from "@/hooks/settings/useBridgeStatus";
import { ServerInstance } from "@/lib/api";
import { BridgeSftpConfigCard } from "./BridgeSftpConfigCard";
import { BridgeRemoteLogsPanel } from "./BridgeRemoteLogsPanel";

interface RemoteFile {
  name: string;
  size: number;
  modifiedAt: string | null;
}

interface BridgeRemoteConnectionPanelProps {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  activeServer: ServerInstance | null;
  bridgeStatus: BridgeStatus | null;
  bridgeLoading: boolean;
  testingSftp: boolean;
  handleTestSftp: () => Promise<void>;
  handleConfigureSftp: () => Promise<void>;
  remoteConfigError: string | null;
  remoteConfigFiles: RemoteFile[];
  loadingRemoteConfig: boolean;
  handleCheckRemoteConfig: () => Promise<void>;
  remoteLogError: string | null;
  remoteLogs: RemoteFile[];
  remoteLogContent: {
    name: string;
    content: string;
    truncated: boolean;
    bytesReturned: number;
  } | null;
  loadingRemoteLogs: boolean;
  handleListRemoteLogs: () => Promise<void>;
  handleTailRemoteLog: (name: string) => Promise<void>;
}

export function BridgeRemoteConnectionPanel({
  settings,
  updateSetting,
  activeServer,
  bridgeStatus,
  bridgeLoading,
  testingSftp,
  handleTestSftp,
  handleConfigureSftp,
  remoteConfigError,
  remoteConfigFiles,
  loadingRemoteConfig,
  handleCheckRemoteConfig,
  remoteLogError,
  remoteLogs,
  remoteLogContent,
  loadingRemoteLogs,
  handleListRemoteLogs,
  handleTailRemoteLog,
}: BridgeRemoteConnectionPanelProps) {
  return (
    <div className="border-t border-border/60 pt-5 space-y-4">
      <div>
        <p className="text-sm font-medium">Remote connection</p>
        <p className="mt-1 text-xs text-muted-foreground">
          PanelBridge and RCON are separate transports. Configure both for a
          remote server so every Events, Players, and bridge action has the
          path it needs.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-border/60 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">RCON command connection</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Used for console commands and RCON-backed event actions. It
                is stored with the active server profile, not with
                PanelBridge.
              </p>
            </div>
            <Link className="h-4 w-4 shrink-0 text-primary" />
          </div>
          {activeServer ? (
            <div className="rounded border border-border/50 bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{activeServer.name}</p>
              <p className="mt-1 font-mono">
                {activeServer.rconHost || "Host not configured"}:
                {activeServer.rconPort || "port not configured"}
              </p>
            </div>
          ) : (
            <p className="text-xs text-warning">
              No active server profile is available.
            </p>
          )}
          <RouterLink
            to="/servers"
            className="inline-flex text-xs font-medium text-primary hover:underline underline-offset-2"
          >
            Edit active server RCON connection
          </RouterLink>
        </div>

        <BridgeSftpConfigCard
          settings={settings}
          updateSetting={updateSetting}
          bridgeStatus={bridgeStatus}
          bridgeLoading={bridgeLoading}
          testingSftp={testingSftp}
          handleTestSftp={handleTestSftp}
          handleConfigureSftp={handleConfigureSftp}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        <strong className="text-foreground">Server logs:</strong> read-only.
        The panel lists the remote log folder and fetches the tail of a file
        on demand. Nothing is written to the remote host and whole files are
        never mirrored to disk.
      </p>

      <div className="rounded-md border border-border/60 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Remote server config</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Absolute path to the <code>Server</code> folder on the remote
              host. Setting this unlocks the Server Config page for a remote
              server: the panel mirrors <code>.ini</code> and{" "}
              <code>SandboxVars.lua</code> over SFTP, edits the copy, then
              writes it back.
            </p>
          </div>
          <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[18rem] flex-1 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="sftp-config-path">Remote Server folder</Label>
              <FieldHelp
                description="Absolute path, on the remote host, to the Zomboid Server folder containing your .ini and SandboxVars.lua files."
                context="Only needed to edit a remote server's config from the Server Config page — the panel mirrors these files over SFTP, edits the copy, then writes it back."
                recommendation="advanced"
                articleId="server-config-deep-dive"
              />
            </div>
            <Input
              id="sftp-config-path"
              value={settings.panelBridgeSftpConfigPath}
              onChange={(event) =>
                updateSetting("panelBridgeSftpConfigPath", event.target.value)
              }
              placeholder="/home/pz/Zomboid/Server"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleCheckRemoteConfig}
            disabled={loadingRemoteConfig || !settings.panelBridgeSftpConfigPath.trim()}
          >
            {loadingRemoteConfig ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FolderOpen className="mr-2 h-4 w-4" />
            )}
            Check folder
          </Button>
        </div>

        {remoteConfigError && (
          <p className="text-xs text-destructive">{remoteConfigError}</p>
        )}

        {remoteConfigFiles.length > 0 && (
          <ul className="max-h-40 divide-y divide-border/40 overflow-auto rounded border border-border/50">
            {remoteConfigFiles.map((file) => (
              <li
                key={file.name}
                className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs"
              >
                <span className="font-mono">{file.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {file.size} B
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <BridgeRemoteLogsPanel
        settings={settings}
        updateSetting={updateSetting}
        remoteLogError={remoteLogError}
        remoteLogs={remoteLogs}
        remoteLogContent={remoteLogContent}
        loadingRemoteLogs={loadingRemoteLogs}
        handleListRemoteLogs={handleListRemoteLogs}
        handleTailRemoteLog={handleTailRemoteLog}
      />
    </div>
  );
}
