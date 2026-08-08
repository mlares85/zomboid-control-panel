import { Cloud, Link, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppSettings } from "@/lib/settingsTypes";
import { BridgeStatus } from "@/hooks/settings/useBridgeStatus";

interface BridgeSftpConfigCardProps {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  bridgeStatus: BridgeStatus | null;
  bridgeLoading: boolean;
  testingSftp: boolean;
  handleTestSftp: () => Promise<void>;
  handleConfigureSftp: () => Promise<void>;
}

// SFTP connection fields for the PanelBridge status/command-queue folder,
// plus the test/start controls and current transport status line.
export function BridgeSftpConfigCard({
  settings,
  updateSetting,
  bridgeStatus,
  bridgeLoading,
  testingSftp,
  handleTestSftp,
  handleConfigureSftp,
}: BridgeSftpConfigCardProps) {
  return (
    <div className="rounded-md border border-border/60 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">SFTP PanelBridge files</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Syncs only the bridge status, command queue, and results folder.
            It does not read general server files.
          </p>
        </div>
        <Cloud className="h-4 w-4 shrink-0 text-primary" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sftp-host">SFTP host</Label>
          <Input
            id="sftp-host"
            value={settings.panelBridgeSftpHost}
            onChange={(event) =>
              updateSetting("panelBridgeSftpHost", event.target.value)
            }
            placeholder="pz.example.net"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sftp-port">Port</Label>
          <Input
            id="sftp-port"
            inputMode="numeric"
            value={settings.panelBridgeSftpPort}
            onChange={(event) =>
              updateSetting("panelBridgeSftpPort", event.target.value)
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sftp-user">Username</Label>
          <Input
            id="sftp-user"
            autoComplete="username"
            value={settings.panelBridgeSftpUsername}
            onChange={(event) =>
              updateSetting("panelBridgeSftpUsername", event.target.value)
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sftp-password">Password</Label>
          <Input
            id="sftp-password"
            type="password"
            autoComplete="current-password"
            value={settings.panelBridgeSftpPassword}
            onChange={(event) =>
              updateSetting("panelBridgeSftpPassword", event.target.value)
            }
            placeholder="Stored securely"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sftp-bridge-path">Remote bridge folder</Label>
        <Input
          id="sftp-bridge-path"
          value={settings.panelBridgeSftpBridgePath}
          onChange={(event) =>
            updateSetting("panelBridgeSftpBridgePath", event.target.value)
          }
          placeholder="/home/pz/Zomboid/Lua/panelbridge/MyServer"
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-36 space-y-1.5">
          <Label htmlFor="sftp-poll">Sync interval (seconds)</Label>
          <Input
            id="sftp-poll"
            inputMode="numeric"
            value={settings.panelBridgeSftpPollIntervalSeconds}
            onChange={(event) =>
              updateSetting(
                "panelBridgeSftpPollIntervalSeconds",
                event.target.value,
              )
            }
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleTestSftp}
          disabled={testingSftp || bridgeLoading}
        >
          {testingSftp ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Link className="mr-2 h-4 w-4" />
          )}
          Test SFTP
        </Button>
        <Button type="button" onClick={handleConfigureSftp} disabled={bridgeLoading}>
          {bridgeLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Cloud className="mr-2 h-4 w-4" />
          )}
          Start SFTP bridge
        </Button>
      </div>
      {bridgeStatus?.transport?.type === "sftp" && (
        <p className="text-xs text-muted-foreground">
          SFTP {bridgeStatus.transport.running ? "running" : "stopped"}
          {bridgeStatus.transport.lastLatencyMs != null
            ? `, last sync ${bridgeStatus.transport.lastLatencyMs} ms`
            : ""}
          {bridgeStatus.transport.lastError
            ? `, last error: ${bridgeStatus.transport.lastError}`
            : ""}
        </p>
      )}
    </div>
  );
}
