import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ServerInstance } from "@/lib/api";
import { FieldHelp } from "@/components/FieldHelp";
import { Label } from "@/components/ui/label";

interface BridgeInstallModCardProps {
  servers: ServerInstance[];
  selectedInstallServerId: string;
  setSelectedInstallServerId: (id: string) => void;
  installingMod: boolean;
  handleInstallMod: () => Promise<void>;
  selectedInstallTarget: string | null;
}

// Copies the bundled PanelBridge.lua into a chosen server's media/lua
// folder.
export function BridgeInstallModCard({
  servers,
  selectedInstallServerId,
  setSelectedInstallServerId,
  installingMod,
  handleInstallMod,
  selectedInstallTarget,
}: BridgeInstallModCardProps) {
  return (
    <div className="p-4 bg-muted rounded-xl space-y-3">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium">Install PanelBridge.lua</p>
        <FieldHelp
          description="Copies the bundled PanelBridge.lua mod file into the selected server's media/lua folder."
          context="Required for PanelBridge (in-world actions, live chat, weather) to work at all — pick the target server and install before starting the bridge watcher."
          recommendation="must-configure"
          articleId="panelbridge-internals"
        />
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <Label htmlFor="bridge-install-server" className="sr-only">
          Target server
        </Label>
        <Select
          value={selectedInstallServerId}
          onValueChange={setSelectedInstallServerId}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select server..." />
          </SelectTrigger>
          <SelectContent>
            {servers.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                No servers configured
              </div>
            ) : (
              servers.map((server) => (
                <SelectItem key={String(server.id)} value={String(server.id)}>
                  {server.name} {server.isActive ? "(Active)" : ""}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          onClick={handleInstallMod}
          disabled={installingMod || !selectedInstallServerId}
          className="gap-2"
          variant="outline"
        >
          {installingMod ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Install Mod
        </Button>
      </div>
      {selectedInstallTarget && (
        <p className="text-xs text-muted-foreground break-all">
          Destination:{" "}
          <code className="bg-background px-1 rounded">{selectedInstallTarget}</code>
        </p>
      )}
    </div>
  );
}
