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
      <p className="text-sm font-medium">Install PanelBridge.lua</p>
      <div className="flex flex-wrap gap-3 items-center">
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
