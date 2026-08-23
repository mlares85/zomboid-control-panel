import { Eye, EyeOff, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  adminPassword: string;
  onAdminPasswordChange: (value: string) => void;
  adminPasswordVisible: boolean;
  onToggleAdminPasswordVisible: () => void;
  useUpnp: boolean;
  onUseUpnpChange: (value: boolean) => void;
  useNoSteam: boolean;
  onUseNoSteamChange: (value: boolean) => void;
  useDebug: boolean;
  onUseDebugChange: (value: boolean) => void;
}

// Advanced options accordion (game port, admin password, UPnP/no-steam/debug
// toggles) used on the Performance step of Full Install.
export function AdvancedOptionsSection({ advanced }: { advanced: AdvancedGroup }) {
  return (
    <Accordion type="single" collapsible className="border rounded-lg">
      <AccordionItem value="advanced" className="border-0">
        <AccordionTrigger className="px-4 hover:no-underline">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            <span>Advanced Options</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                Admin Password <span className="text-destructive">*</span>
                <FieldHelp
                  description="In-game admin password, passed as the server's -adminpassword launch argument."
                  context="Required before the server can start for the first time. This is different from the RCON password above and is used to log in as admin in-game."
                  recommendation="must-configure"
                  articleId="first-run-checklist"
                />
              </Label>
              <div className="relative">
                <Input
                  type={advanced.adminPasswordVisible ? "text" : "password"}
                  value={advanced.adminPassword}
                  onChange={(e) => advanced.onAdminPasswordChange(e.target.value)}
                  placeholder="Required before first server start"
                  className="pr-10"
                  maxLength={128}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-9 w-9 p-0"
                  onClick={advanced.onToggleAdminPasswordVisible}
                  aria-label={advanced.adminPasswordVisible ? "Hide admin password" : "Show admin password"}
                >
                  {advanced.adminPasswordVisible ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Required before first server start.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">UPnP</p>
                <p className="text-xs text-muted-foreground">Attempt automatic router port forwarding</p>
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
                <p className="text-xs text-muted-foreground">Use non-Steam mode (for GOG and LAN setups)</p>
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
                <p className="text-xs text-muted-foreground">Enable verbose startup and runtime logs</p>
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
