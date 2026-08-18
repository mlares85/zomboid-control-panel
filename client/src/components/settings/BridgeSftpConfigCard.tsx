import { Cloud, Link, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldHelp } from "@/components/FieldHelp";
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
          <div className="flex items-center gap-1.5">
            <Label htmlFor="sftp-host">SFTP host</Label>
            <FieldHelp
              description="Hostname or IP address of the machine running the game server, used to sync PanelBridge status/command files over SFTP."
              context="Required for remote (non-local) PanelBridge setups — the bridge can't reach the server without a correct host."
              recommendation="must-configure"
              articleId="panelbridge-internals"
            />
          </div>
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
          <div className="flex items-center gap-1.5">
            <Label htmlFor="sftp-port">Port</Label>
            <FieldHelp
              description="TCP port the remote SFTP server listens on."
              context="22 is the standard SSH/SFTP port and works for most setups. Only change it if your host runs SFTP on a non-default port."
              recommendation="safe-default"
              articleId="panelbridge-internals"
            />
          </div>
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
          <div className="flex items-center gap-1.5">
            <Label htmlFor="sftp-user">Username</Label>
            <FieldHelp
              description="The SFTP/SSH login username on the remote game-server host."
              context="Must be a real account on that machine with read/write access to the PanelBridge folder — the sync will fail without it."
              recommendation="must-configure"
              articleId="panelbridge-internals"
            />
          </div>
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
          <div className="flex items-center gap-1.5">
            <Label htmlFor="sftp-password">Password</Label>
            <FieldHelp
              description="The SFTP/SSH password for the account above."
              context="Stored securely by the panel and required for the SFTP transport to authenticate. Without it, PanelBridge sync cannot start."
              recommendation="must-configure"
              articleId="panelbridge-internals"
            />
          </div>
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
        <div className="flex items-center gap-1.5">
          <Label htmlFor="sftp-bridge-path">Remote bridge folder</Label>
          <FieldHelp
            description="Absolute path, on the remote host, to the PanelBridge status/command-queue folder created by the Lua mod."
            context="Must exactly match where PanelBridge.lua writes its files on the game server. Copy this from the mod's own log output if unsure."
            recommendation="must-configure"
            articleId="panelbridge-internals"
          />
        </div>
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
          <div className="flex items-center gap-1.5">
            <Label htmlFor="sftp-poll">Sync interval (seconds)</Label>
            <FieldHelp
              description="How often the panel polls the remote host over SFTP for new PanelBridge status/command files."
              context="The default balances responsiveness against SFTP traffic. Lower it for snappier in-game actions; raise it if your host is on a slow or metered connection."
              recommendation="safe-default"
              articleId="panelbridge-internals"
            />
          </div>
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
