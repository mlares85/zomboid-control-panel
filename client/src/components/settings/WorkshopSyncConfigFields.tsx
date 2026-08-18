import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FieldHelp } from "@/components/FieldHelp";
import { AppSettings } from "@/lib/settingsTypes";

interface WorkshopSyncConfigFieldsProps {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  autoSyncOn: boolean;
  effectiveCredsConfigured: boolean;
  collectionIdValid: boolean;
}

// Collection ID + auto-sync toggle — the two settings that decide what the
// panel syncs against and whether it does so automatically.
export function WorkshopSyncConfigFields({
  settings,
  updateSetting,
  autoSyncOn,
  effectiveCredsConfigured,
  collectionIdValid,
}: WorkshopSyncConfigFieldsProps) {
  return (
    <div className="grid gap-6 border-b border-border/40 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.8fr)]">
      <div className="space-y-2">
        <span className="inline-flex items-center gap-1.5">
          <Label htmlFor="ws-collection-id" className="text-base">
            Collection ID
          </Label>
          <FieldHelp
            description="The numeric Steam Workshop collection ID the panel keeps in sync with your tracked mods."
            context="Find it in your collection's URL on Steam, after `?id=`. You must own the collection to write to it."
            recommendation="must-configure"
            articleId="mod-manager-basics"
          />
        </span>
        <Input
          id="ws-collection-id"
          value={settings.workshopCollectionId}
          onChange={(e) =>
            updateSetting("workshopCollectionId", e.target.value.trim())
          }
          placeholder="e.g. 3123456789"
          className="h-11 max-w-md font-mono"
          maxLength={20}
        />
        <p className="text-sm text-muted-foreground">
          Open your collection on Steam and copy the numeric ID from the
          URL (the digits after <code>?id=</code>). You must own the
          collection.
        </p>
      </div>

      <div
        className={`flex items-start justify-between gap-4 lg:border-l lg:border-border/40 lg:pl-6 ${
          autoSyncOn && !effectiveCredsConfigured ? "text-warning" : ""
        }`}
      >
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1.5">
            <Label className="text-base">Auto-sync on add / remove</Label>
            <FieldHelp
              description="Automatically pushes tracked-mod changes to your Steam Workshop collection in the background."
              context="Needs Steam session cookies configured below to actually write. Failures are logged but never block the add/remove action itself."
              recommendation="advanced"
              articleId="mod-manager-basics"
            />
          </span>
          <p className="text-sm text-muted-foreground">
            When you track or untrack a mod, the panel updates the
            collection in the background. Failures are logged but don't
            block your action.
          </p>
          {autoSyncOn && !effectiveCredsConfigured && (
            <p className="text-xs text-warning flex items-center gap-1 pt-1">
              <AlertTriangle className="w-3 h-3" />
              Auto-sync needs Steam session cookies below to actually
              push changes.
            </p>
          )}
          {autoSyncOn && !collectionIdValid && (
            <p className="text-xs text-warning flex items-center gap-1 pt-1">
              <AlertTriangle className="w-3 h-3" />
              Set a Collection ID first — nothing to sync to yet.
            </p>
          )}
        </div>
        <Switch
          checked={autoSyncOn}
          onCheckedChange={(v) =>
            updateSetting("workshopCollectionAutoSync", v)
          }
        />
      </div>
    </div>
  );
}
