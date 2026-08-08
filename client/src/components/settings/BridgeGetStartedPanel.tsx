import { FolderOpen, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BridgeGetStartedPanelProps {
  bridgeLoading: boolean;
  handleAutoConfigure: () => Promise<void>;
  manualBridgePath: string;
  setManualBridgePath: (value: string) => void;
  handleManualConfigure: () => Promise<void>;
}

// Shown when the bridge watcher isn't running yet: auto setup, plus a
// manual bridge-path fallback for Linux / VPS / custom installs.
export function BridgeGetStartedPanel({
  bridgeLoading,
  handleAutoConfigure,
  manualBridgePath,
  setManualBridgePath,
  handleManualConfigure,
}: BridgeGetStartedPanelProps) {
  return (
    <div className="p-4 bg-muted rounded-xl space-y-3">
      <p className="text-sm font-medium">Get Started</p>
      <ol className="space-y-1.5 text-sm text-muted-foreground list-decimal list-inside">
        <li>
          Install <strong className="text-foreground">PanelBridge.lua</strong>{" "}
          using the section below
        </li>
        <li>
          Set <strong className="text-foreground">LuaChecksum=false</strong>{" "}
          in your server INI
        </li>
        <li>
          Click <strong className="text-foreground">Auto Setup</strong> to
          start the bridge watcher
        </li>
        <li>Start or restart the PZ server</li>
      </ol>
      <Button
        onClick={() => handleAutoConfigure()}
        disabled={bridgeLoading}
        className="gap-2"
      >
        {bridgeLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Zap className="w-4 h-4" />
        )}
        Auto Setup
      </Button>

      <div className="border-t border-border/50 pt-3 mt-1 space-y-2">
        <p className="text-xs text-muted-foreground">
          Or set the bridge path manually (Linux / VPS / custom installs):
        </p>
        <div className="flex gap-2">
          <Input
            value={manualBridgePath}
            onChange={(e) => setManualBridgePath(e.target.value)}
            placeholder="/home/pzuser/Zomboid/Lua/panelbridge/MyServer"
            className="text-xs h-9"
          />
          <Button
            onClick={handleManualConfigure}
            disabled={bridgeLoading || !manualBridgePath.trim()}
            variant="secondary"
            size="sm"
            className="shrink-0 gap-1.5"
          >
            {bridgeLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FolderOpen className="w-3.5 h-3.5" />
            )}
            Connect
          </Button>
        </div>
      </div>
    </div>
  );
}
