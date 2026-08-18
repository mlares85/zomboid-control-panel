import type { Dispatch, SetStateAction } from "react";
import { Clock } from "lucide-react";
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
import { configApi } from "@/lib/api";
import { AppSettings } from "@/lib/settingsTypes";
import { WorkshopCollectionSyncCard } from "./WorkshopCollectionSyncCard";
import { SteamApiKeyCard } from "./SteamApiKeyCard";

interface ModsSettingsProps {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  setOriginalSettings: Dispatch<SetStateAction<AppSettings | null>>;
}

export function ModsSettings({
  settings,
  updateSetting,
  setSettings,
  setOriginalSettings,
}: ModsSettingsProps) {
  return (
    <>
      <Card id="settings-mods">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Mod Update Settings
            </CardTitle>
          </div>
          <CardDescription>
            How often to check for Workshop updates and whether to
            auto-restart when updates arrive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="max-w-xs space-y-2">
            <span className="inline-flex items-center gap-1.5">
              <Label htmlFor="mod-check-interval" className="text-base">
                Check Interval (minutes)
              </Label>
              <FieldHelp
                description="How often the panel polls Steam Workshop for updates to your tracked mods."
                context="Shorter intervals catch updates faster but add more Steam API calls. 15-30 minutes works well for most servers."
                recommendation="safe-default"
                articleId="mod-updates"
              />
            </span>
            <Input
              id="mod-check-interval"
              type="number"
              value={settings.modCheckInterval}
              onChange={(e) => updateSetting("modCheckInterval", e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              min="1"
              max="120"
              step="1"
              className="h-11"
              inputMode="numeric"
            />
            <p className="text-sm text-muted-foreground">
              Check every 1-120 minutes. Changes take effect as soon as you
              save.
            </p>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50">
            <Switch
              checked={settings.modAutoRestart}
              onCheckedChange={(value) => updateSetting("modAutoRestart", value)}
              aria-label="Auto-restart server when mods update"
            />
            <div>
              <span className="inline-flex items-center gap-1.5">
                <Label className="text-base">
                  Auto-restart server when mods update
                </Label>
                <FieldHelp
                  description="Automatically restarts the game server when a tracked mod has an update available."
                  context="Turn this on for hands-off maintenance. Leave it off if you'd rather review changelogs before restarting, since restarts disconnect players."
                  recommendation="safe-default"
                  articleId="mod-updates"
                />
              </span>
              <p className="text-sm text-muted-foreground">
                Automatically restart the server when mod updates are
                detected
              </p>
            </div>
          </div>
          {settings.modAutoRestart && (
            <div className="max-w-xs space-y-2 pl-4 border-l-2 border-primary/30">
              <span className="inline-flex items-center gap-1.5">
                <Label htmlFor="mod-restart-delay" className="text-base">
                  Restart Delay (minutes)
                </Label>
                <FieldHelp
                  description="How long players are warned before an auto-restart triggered by a mod update."
                  context="Longer delays give players more time to reach safety in-game."
                  recommendation="safe-default"
                  articleId="mod-updates"
                />
              </span>
              <Input
                id="mod-restart-delay"
                type="number"
                value={settings.modRestartDelay}
                onChange={(e) =>
                  updateSetting("modRestartDelay", e.target.value)
                }
                onWheel={(e) => e.currentTarget.blur()}
                min="1"
                max="30"
                className="h-11"
                inputMode="numeric"
              />
              <p className="text-sm text-muted-foreground">
                Players are warned before the restart happens.
              </p>
            </div>
          )}
          <div className="border-t border-border/60 pt-6">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50">
              <Switch
                checked={settings.serverAutoUpdate}
                onCheckedChange={(value) =>
                  updateSetting("serverAutoUpdate", value)
                }
                aria-label="Automatically update the server when a new build is detected"
              />
              <div>
                <span className="inline-flex items-center gap-1.5">
                  <Label className="text-base">
                    Automatically update the game server
                  </Label>
                  <FieldHelp
                    description="Automatically stops the server, updates it through SteamCMD, and restarts it when a new game build is detected."
                    context="Convenient but can update the server before mods have caught up to a new build, breaking compatibility. Enable only if you're comfortable with occasional mod breakage."
                    recommendation="advanced"
                    articleId="mod-updates"
                  />
                </span>
                <p className="text-sm text-muted-foreground">
                  Save, stop, update through SteamCMD, then start again when
                  a new build is detected.
                </p>
              </div>
            </div>
            <div className="max-w-md space-y-2 pl-4 pt-4 border-l-2 border-primary/30">
              <span className="inline-flex items-center gap-1.5">
                <Label htmlFor="steam-update-account" className="text-base">
                  SteamCMD update account
                </Label>
                <FieldHelp
                  description="The Steam account name SteamCMD uses to check for and download server updates."
                  context="Leave blank for anonymous login, which works for the base dedicated server. Only needed if anonymous updates fail to access a required depot."
                  recommendation="advanced"
                  articleId="mod-updates"
                />
              </span>
              <Input
                id="steam-update-account"
                value={settings.steamUpdateAccount}
                onChange={(e) =>
                  updateSetting("steamUpdateAccount", e.target.value)
                }
                placeholder="Leave blank to use anonymous login"
                autoComplete="username"
                className="h-11"
              />
              <p className="text-sm text-muted-foreground">
                Use a Steam account that owns Project Zomboid when anonymous
                updates cannot access a depot. Only the account name is
                saved; SteamCMD keeps its own encrypted login session and may
                ask for Steam Guard again.
              </p>
            </div>
            {settings.serverAutoUpdate && (
              <div className="max-w-md space-y-2 pl-4 pt-4 border-l-2 border-primary/30">
                <span className="inline-flex items-center gap-1.5">
                  <Label
                    htmlFor="server-update-warning-minutes"
                    className="text-base"
                  >
                    Player warning (minutes)
                  </Label>
                  <FieldHelp
                    description="How long players are warned in-game before an automatic server update begins."
                    context="Defaults to 15 minutes. Set to 0 to update immediately whenever no players are online."
                    recommendation="safe-default"
                    articleId="mod-updates"
                  />
                </span>
                <Input
                  id="server-update-warning-minutes"
                  type="number"
                  value={settings.serverAutoUpdateWarningMinutes}
                  onChange={(e) =>
                    updateSetting(
                      "serverAutoUpdateWarningMinutes",
                      e.target.value,
                    )
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                  min="0"
                  max="60"
                  className="h-11"
                  inputMode="numeric"
                />
                <p className="text-sm text-muted-foreground">
                  Defaults to 15 minutes. Set 0 to update immediately when no
                  players are online.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Workshop Collection Sync ──────────────────────────────────────── */}
      <WorkshopCollectionSyncCard
        settings={settings}
        updateSetting={updateSetting}
        persistCookies={async (cookies) => {
          await configApi.updateAppSettings(cookies);
          setSettings((current) => ({ ...current, ...cookies }));
          setOriginalSettings((current) =>
            current ? { ...current, ...cookies } : current,
          );
        }}
      />

      <SteamApiKeyCard settings={settings} updateSetting={updateSetting} />
    </>
  );
}
