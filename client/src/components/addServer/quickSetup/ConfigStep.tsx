import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldHelp } from "@/components/FieldHelp";
import { PasswordsCard, type PasswordsGroup } from "./PasswordsCard";
import { MemoryCard, type MemoryGroup } from "./MemoryCard";
import { AdvancedOptionsSection, type AdvancedGroup } from "./AdvancedOptionsSection";

interface ConfigStepProps {
  serverName: string;
  onServerNameChange: (name: string) => void;
  passwords: PasswordsGroup;
  memory: MemoryGroup;
  advanced: AdvancedGroup;
  onBrowseFolder: (
    setter: (path: string) => void,
    description: string,
    currentPath?: string,
  ) => void;
}

// Quick Setup Step 2: identity, RCON/admin credentials, memory, and advanced
// runtime options for a server pointed at existing PZ files.
export function ConfigStep({
  serverName,
  onServerNameChange,
  passwords,
  memory,
  advanced,
  onBrowseFolder,
}: ConfigStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 pb-6 border-b">
        <h2 className="text-2xl font-semibold">Configure Server</h2>
        <p className="text-muted-foreground">
          Set server name, RCON access, and memory limits.
        </p>
      </div>

      <div className="grid gap-6">
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
            Each server needs a unique name. Creates separate config files.
          </p>
        </div>

        <PasswordsCard passwords={passwords} />
        <MemoryCard memory={memory} />
        <AdvancedOptionsSection advanced={advanced} onBrowseFolder={onBrowseFolder} />
      </div>
    </div>
  );
}
