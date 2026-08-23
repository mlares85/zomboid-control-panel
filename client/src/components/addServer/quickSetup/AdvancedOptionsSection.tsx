import { Settings2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FieldHelp } from "@/components/FieldHelp";

export interface AdvancedGroup {
  serverPort: number;
  onServerPortChange: (value: number) => void;
  useUpnp: boolean;
  onUseUpnpChange: (value: boolean) => void;
  useNoSteam: boolean;
  onUseNoSteamChange: (value: boolean) => void;
  useDebug: boolean;
  onUseDebugChange: (value: boolean) => void;
  dataPath: {
    enabled: boolean;
    onEnabledChange: (enabled: boolean) => void;
    value: string;
    onValueChange: (value: string) => void;
  };
}

interface AdvancedOptionsSectionProps {
  advanced: AdvancedGroup;
  onBrowseFolder: (
    setter: (path: string) => void,
    description: string,
    currentPath?: string,
  ) => void;
}

// Advanced options accordion (custom data path, game port, and runtime
// toggles) used on the Configure step of Quick Setup.
export function AdvancedOptionsSection({ advanced, onBrowseFolder }: AdvancedOptionsSectionProps) {
  return (
    <Accordion type="single" collapsible className="border rounded-lg">
      <AccordionItem value="advanced" className="border-0">
        <AccordionTrigger className="px-4 hover:no-underline">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            <span>Advanced Options</span>
            {advanced.dataPath.enabled && advanced.dataPath.value && (
              <Badge variant="secondary" className="ml-2">
                Custom data path set
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4 space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={advanced.dataPath.enabled}
              onCheckedChange={advanced.dataPath.onEnabledChange}
            />
            <Label className="flex items-center gap-1.5">
              Custom config location
              <FieldHelp
                description="Points the server's save/config data at a folder outside the default Zomboid data directory."
                context="Useful for Docker bind mounts or keeping saves on a different disk. Leave off to use the default location beside the install folder."
                recommendation="advanced"
                articleId="adding-servers"
              />
            </Label>
          </div>
          {advanced.dataPath.enabled && (
            <div className="flex gap-2">
              <Input
                value={advanced.dataPath.value}
                onChange={(e) => advanced.dataPath.onValueChange(e.target.value)}
                placeholder="Custom data folder path"
                className="font-mono flex-1"
                maxLength={260}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  onBrowseFolder(
                    advanced.dataPath.onValueChange,
                    "Select config folder",
                    advanced.dataPath.value,
                  )
                }
                aria-label="Browse config folder"
              >
                <FolderOpen className="w-4 h-4" />
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              Game Port
              <FieldHelp
                description="UDP port players connect to."
                context="Change this only if 16261 is already used by another server on this machine — remember to forward the new port on your router."
                recommendation="advanced"
                articleId="adding-servers"
              />
            </Label>
            <Input
              type="number"
              value={advanced.serverPort}
              onChange={(e) => advanced.onServerPortChange(parseInt(e.target.value) || 16261)}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">Default port: 16261</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">UPnP</p>
                <p className="text-xs text-muted-foreground">
                  Attempt automatic router port forwarding
                </p>
              </div>
              <Switch
                checked={advanced.useUpnp}
                onCheckedChange={advanced.onUseUpnpChange}
                aria-label="Enable UPnP"
              />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">No Steam</p>
                <p className="text-xs text-muted-foreground">
                  Use non-Steam mode (for GOG and LAN setups)
                </p>
              </div>
              <Switch
                checked={advanced.useNoSteam}
                onCheckedChange={advanced.onUseNoSteamChange}
                aria-label="Enable no-Steam mode"
              />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">Debug</p>
                <p className="text-xs text-muted-foreground">
                  Enable verbose startup and runtime logs
                </p>
              </div>
              <Switch
                checked={advanced.useDebug}
                onCheckedChange={advanced.onUseDebugChange}
                aria-label="Enable debug mode"
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
