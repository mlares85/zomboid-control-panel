import { FolderOpen, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldHelp } from "@/components/FieldHelp";
import type { SteamBranch } from "@/lib/api";
import { LINUX_SERVICE_INSTALL_PATH } from "./helpers";

interface InstallConfigStepProps {
  installPath: string;
  onInstallPathChange: (path: string) => void;
  serverName: string;
  onServerNameChange: (name: string) => void;
  branch: string;
  onBranchChange: (branch: string) => void;
  availableBranches: SteamBranch[];
  loadingBranches: boolean;
  dataPath: {
    enabled: boolean;
    onEnabledChange: (enabled: boolean) => void;
    value: string;
    onValueChange: (value: string) => void;
  };
  onBrowseFolder: (
    setter: (path: string) => void,
    description: string,
    currentPath?: string,
  ) => void;
}

// Full Install Step 2: install path, server name, game version, custom data path.
export function InstallConfigStep({
  installPath,
  onInstallPathChange,
  serverName,
  onServerNameChange,
  branch,
  onBranchChange,
  availableBranches,
  loadingBranches,
  dataPath,
  onBrowseFolder,
}: InstallConfigStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 pb-6 border-b">
        <h2 className="text-2xl font-semibold">Server Details</h2>
        <p className="text-muted-foreground">
          Choose where files are installed and set the server identity.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Installation Path */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-base flex items-center gap-1.5">
              Install Folder
              <FieldHelp
                description="Folder where SteamCMD downloads and installs the dedicated server files."
                context="SteamCMD writes ~3GB here. The panel process must have write access, or the install step fails partway through."
                recommendation="must-configure"
                articleId="adding-servers"
              />
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-0 text-xs"
              onClick={() => onInstallPathChange(LINUX_SERVICE_INSTALL_PATH)}
            >
              Use Linux service path
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              value={installPath}
              onChange={(e) => onInstallPathChange(e.target.value)}
              placeholder="Folder where server files will be installed"
              className="font-mono flex-1"
              maxLength={260}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      onBrowseFolder(
                        onInstallPathChange,
                        "Select server folder",
                        installPath,
                      )
                    }
                    aria-label="Browse install folder"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Browse folder</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-xs text-muted-foreground">
            SteamCMD downloads approximately 3 GB here. The panel service must
            be allowed to write to this folder.
          </p>
        </div>

        <div className="border border-border/60 bg-muted/40 rounded-lg p-4 text-sm space-y-2">
          <p className="font-medium flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            Linux service installs
          </p>
          <p className="text-muted-foreground">
            If the panel runs through the bundled systemd service, use{" "}
            <code className="bg-muted px-1 rounded">
              {LINUX_SERVICE_INSTALL_PATH}
            </code>
            . Other folders require a systemd permission change.
          </p>
          <p className="text-muted-foreground">
            The server data folder is created beside the install folder:{" "}
            <code className="bg-muted px-1 rounded break-all">
              {installPath.trim()
                ? `${installPath.trim()}_Data`
                : "your-install-folder_Data"}
            </code>
            . Both folders must be writable.
          </p>
        </div>

        {/* Server Name */}
        <div className="space-y-2">
          <Label className="text-base flex items-center gap-1.5">
            Server Name
            <FieldHelp
              description="Internal server identifier used for Project Zomboid's config/save file names."
              context="Alphanumeric and underscores only — this becomes part of file names on disk, so it can't be changed later without losing the link to existing saves."
              recommendation="must-configure"
              articleId="adding-servers"
            />
          </Label>
          <Input
            value={serverName}
            onChange={(e) =>
              onServerNameChange(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))
            }
            placeholder="myserver"
            className="font-mono"
            maxLength={64}
          />
          <p className="text-xs text-muted-foreground">
            Alphanumeric and underscores only. Used for config files.
          </p>
        </div>

        {/* Branch Selection */}
        <div className="space-y-2">
          <Label className="text-base flex items-center gap-1.5">
            Game Version
            <FieldHelp
              description="Steam branch/build of the dedicated server to install."
              context="Stick to the default stable branch unless you specifically need a beta/test build — mismatched client/server versions can't connect to each other."
              recommendation="safe-default"
              articleId="adding-servers"
            />
          </Label>
          <Select
            value={branch}
            onValueChange={onBranchChange}
            disabled={loadingBranches}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  loadingBranches
                    ? "Loading available versions..."
                    : "Select game version"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {availableBranches.map((b) => (
                <SelectItem key={b.name} value={b.name}>
                  <div className="flex flex-col">
                    <span>
                      {b.name === "public"
                        ? "Build 42 (Stable)"
                        : b.description || b.name}
                    </span>
                    {b.buildId && (
                      <span className="text-xs text-muted-foreground">
                        Build: {b.buildId}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Custom Data Path - Collapsed by default */}
        <Accordion type="single" collapsible className="border rounded-lg">
          <AccordionItem value="datapath" className="border-0">
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center gap-2 text-sm">
                <FolderOpen className="w-4 h-4" />
                <span>Custom config location</span>
                {dataPath.enabled && dataPath.value && (
                  <Badge variant="secondary" className="ml-2">
                    Set
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Leave this blank to create a data folder beside the install
                  folder. In Docker, choose a bind-mounted folder when
                  overriding it.
                </p>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={dataPath.enabled}
                    onCheckedChange={dataPath.onEnabledChange}
                  />
                  <Label className="flex items-center gap-1.5">
                    Use custom location
                    <FieldHelp
                      description="Points the server's save/config data at a folder outside the default Zomboid data directory."
                      context="Useful for Docker bind mounts or keeping saves on a different disk. Leave off to use the default location beside the install folder."
                      recommendation="advanced"
                      articleId="adding-servers"
                    />
                  </Label>
                </div>
                {dataPath.enabled && (
                  <div className="flex gap-2">
                    <Input
                      value={dataPath.value}
                      onChange={(e) => dataPath.onValueChange(e.target.value)}
                      placeholder="Custom data folder path"
                      className="font-mono flex-1"
                      maxLength={260}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        onBrowseFolder(
                          dataPath.onValueChange,
                          "Select config folder",
                          dataPath.value,
                        )
                      }
                      aria-label="Browse config folder"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
