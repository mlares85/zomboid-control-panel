import { User } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FieldHelp } from "@/components/FieldHelp";
import { AppSettings } from "@/lib/settingsTypes";

interface CharacterExportsSettingsProps {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
}

export function CharacterExportsSettings({
  settings,
  updateSetting,
}: CharacterExportsSettingsProps) {
  return (
    <Card id="settings-character-exports">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <User className="w-4 h-4 text-primary" />
          Character Exports
        </CardTitle>
        <CardDescription>
          Per-player character copies, saved separately from world
          backups.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-muted/25 p-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="auto-export-on-login" className="text-sm font-medium">
                Export a character when a player joins
              </Label>
              <FieldHelp
                description="Automatically saves a copy of a player's character shortly after they log in."
                context="Lets you restore a single player's character without rolling back the whole world. Requires PanelBridge to be connected."
                recommendation="safe-default"
                articleId="backups-overview"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Runs about ten seconds after the player loads, so one
              character can be restored without rolling back the world.
              Needs PanelBridge connected.
            </p>
          </div>
          <Switch
            id="auto-export-on-login"
            checked={settings.autoExportOnLogin}
            onCheckedChange={(value) =>
              updateSetting("autoExportOnLogin", value)
            }
            aria-label="Export a character when a player joins"
          />
        </div>
        {settings.autoExportOnLogin && (
          <div className="max-w-xs space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="auto-export-max">Copies kept per player</Label>
              <FieldHelp
                description="How many character exports the panel keeps for each player before deleting the oldest."
                context="The default of a handful of copies is enough for most servers. Raise it if you want a longer history to roll a specific player back through."
                recommendation="safe-default"
                articleId="backups-overview"
              />
            </div>
            <Input
              id="auto-export-max"
              type="number"
              min="1"
              max="50"
              inputMode="numeric"
              value={settings.autoExportMaxPerPlayer}
              onChange={(e) =>
                updateSetting("autoExportMaxPerPlayer", e.target.value)
              }
              onWheel={(e) => e.currentTarget.blur()}
            />
            <p className="text-xs text-muted-foreground">
              Oldest exports are deleted once a player passes this count.
              Restore them from the Players page.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
