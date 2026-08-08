import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Loader2,
  RefreshCw,
  XCircle,
  Zap,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BridgeStatusBadge } from "@/components/BridgeStatusBadge";
import { AppSettings } from "@/lib/settingsTypes";
import { useBridgeStatus } from "@/hooks/settings/useBridgeStatus";
import { useBridgeRemote } from "@/hooks/settings/useBridgeRemote";
import { useBridgeInstall } from "@/hooks/settings/useBridgeInstall";
import { BridgeHowItWorksDialog } from "./BridgeHowItWorksDialog";
import { BridgeConnectionDiagnostics } from "./BridgeConnectionDiagnostics";
import { BridgeRemoteConnectionPanel } from "./BridgeRemoteConnectionPanel";
import { BridgeGetStartedPanel } from "./BridgeGetStartedPanel";
import { BridgeInstallModCard } from "./BridgeInstallModCard";
import type { Socket } from "socket.io-client";

interface BridgeSettingsProps {
  socket: Socket | null;
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
}

export function BridgeSettings({
  socket,
  settings,
  updateSetting,
}: BridgeSettingsProps) {
  const bridge = useBridgeStatus(socket);
  const remote = useBridgeRemote(settings, updateSetting);
  const install = useBridgeInstall();

  const handleConfigureSftp = () =>
    remote.handleConfigureSftp({
      setBridgeLoading: bridge.setBridgeLoading,
      setBridgeError: bridge.setBridgeError,
      fetchBridgeStatus: bridge.fetchBridgeStatus,
    });

  return (
    <Card id="settings-bridge">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Panel Bridge
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              Connects this panel to the live game for weather, utilities,
              richer chat, and other in-world actions
              <BridgeHowItWorksDialog />
            </CardDescription>
          </div>
          {bridge.bridgeStatus && (
            <BridgeStatusBadge
              connected={bridge.bridgeStatus.modConnected}
              running={bridge.bridgeStatus.isRunning}
              loading={bridge.bridgeLoading}
              bridgePath={bridge.bridgeStatus.bridgePath}
              summary={bridge.bridgeStatus.connection?.summary}
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {bridge.bridgeStatus?.modConnected && bridge.bridgeStatus.modStatus && (
          <Alert className="border-primary/30 bg-primary/10" aria-live="polite">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <span className="font-semibold text-primary">
                Connected to {bridge.bridgeStatus.modStatus.serverName || "server"}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Mod Version:</span>{" "}
                <span className="font-medium">
                  {bridge.bridgeStatus.modStatus.version || "Unknown"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Players Online:</span>{" "}
                <span className="font-medium">
                  {bridge.bridgeStatus.modStatus.alive
                    ? (bridge.bridgeStatus.modStatus.playerCount ?? 0)
                    : "Offline"}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Advanced features on Events, Players, and Chat are now available.
            </p>
          </Alert>
        )}

        {!bridge.bridgeStatus?.isRunning && (
          <BridgeGetStartedPanel
            bridgeLoading={bridge.bridgeLoading}
            handleAutoConfigure={bridge.handleAutoConfigure}
            manualBridgePath={bridge.manualBridgePath}
            setManualBridgePath={bridge.setManualBridgePath}
            handleManualConfigure={bridge.handleManualConfigure}
          />
        )}

        {bridge.bridgeStatus?.isRunning && !bridge.bridgeStatus?.modConnected && (
          <Alert className="border-warning/40 bg-warning/10" aria-live="polite">
            <Cloud className="h-4 w-4 text-warning" />
            <AlertTitle className="text-warning">
              Waiting for PZ mod
            </AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                The panel is ready. Start the PZ server with PanelBridge.lua
                installed and{" "}
                <strong className="text-foreground">
                  LuaChecksum=false
                </strong>{" "}
                set.
              </p>
              {bridge.bridgeStatus?.bridgePath && (
                <p className="text-xs text-muted-foreground break-words">
                  Watching:{" "}
                  <code className="rounded bg-background px-1 break-all">
                    {bridge.bridgeStatus.bridgePath}
                  </code>
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {bridge.bridgeStatus?.isRunning &&
          !bridge.bridgeStatus?.modConnected &&
          bridge.bridgeStatus?.connection && (
            <BridgeConnectionDiagnostics bridgeStatus={bridge.bridgeStatus} />
          )}

        {bridge.bridgeError && (
          <Alert variant="destructive" aria-live="assertive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Panel Bridge Error</AlertTitle>
            <AlertDescription>{bridge.bridgeError}</AlertDescription>
          </Alert>
        )}

        {bridge.bridgeStatus?.isRunning && (
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={bridge.handleStopBridge}
              disabled={bridge.bridgeLoading}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              {bridge.bridgeLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              Stop Bridge
            </Button>
            <Button
              onClick={bridge.handlePingMod}
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={!bridge.bridgeStatus?.modConnected || bridge.pinging}
            >
              {bridge.pinging ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {bridge.pinging ? "Pinging..." : "Ping Mod"}
            </Button>
            <Button
              onClick={bridge.fetchBridgeStatus}
              variant="ghost"
              size="sm"
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Status
            </Button>
          </div>
        )}

        <BridgeRemoteConnectionPanel
          settings={settings}
          updateSetting={updateSetting}
          activeServer={install.activeServer}
          bridgeStatus={bridge.bridgeStatus}
          bridgeLoading={bridge.bridgeLoading}
          testingSftp={remote.testingSftp}
          handleTestSftp={remote.handleTestSftp}
          handleConfigureSftp={handleConfigureSftp}
          remoteConfigError={remote.remoteConfigError}
          remoteConfigFiles={remote.remoteConfigFiles}
          loadingRemoteConfig={remote.loadingRemoteConfig}
          handleCheckRemoteConfig={remote.handleCheckRemoteConfig}
          remoteLogError={remote.remoteLogError}
          remoteLogs={remote.remoteLogs}
          remoteLogContent={remote.remoteLogContent}
          loadingRemoteLogs={remote.loadingRemoteLogs}
          handleListRemoteLogs={remote.handleListRemoteLogs}
          handleTailRemoteLog={remote.handleTailRemoteLog}
        />

        {/* Auto-update toggle */}
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/25 p-4">
          <div>
            <Label className="text-sm font-medium">
              Auto-update mod on panel startup
            </Label>
            <p className="text-xs text-muted-foreground">
              When the panel starts, automatically copy the latest bundled
              PanelBridge.lua to the PZ server if versions differ.
            </p>
          </div>
          <Switch
            checked={settings.panelBridgeAutoUpdate}
            onCheckedChange={(value) =>
              updateSetting("panelBridgeAutoUpdate", value)
            }
            aria-label="Auto-update PanelBridge mod"
          />
        </div>

        <BridgeInstallModCard
          servers={install.servers}
          selectedInstallServerId={install.selectedInstallServerId}
          setSelectedInstallServerId={install.setSelectedInstallServerId}
          installingMod={install.installingMod}
          handleInstallMod={install.handleInstallMod}
          selectedInstallTarget={install.selectedInstallTarget}
        />
      </CardContent>
    </Card>
  );
}
