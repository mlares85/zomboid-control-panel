import { Archive, Clock, HardDrive, Loader2, User } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AppSettings } from "@/lib/settingsTypes";
import { useBackupSettings } from "@/hooks/settings/useBackupSettings";
import { BackupList } from "./BackupList";

interface BackupsSettingsProps {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
}

export function BackupsSettings({
  settings,
  updateSetting,
}: BackupsSettingsProps) {
  const {
    backupStatus,
    backups,
    backupLoading,
    creatingBackup,
    restoringBackup,
    restoreConfirmBackup,
    setRestoreConfirmBackup,
    backupSchedule,
    setBackupSchedule,
    backupMaxCount,
    setBackupMaxCount,
    handleCreateBackup,
    handleDeleteBackup,
    handleRestoreBackup,
    handleSaveBackupSettings,
    toggleBackupEnabled,
  } = useBackupSettings();
  return (
    <>
      <Card id="settings-backups">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-primary" />
                World Backups
              </CardTitle>
              <CardDescription>
                Save and restore your server's world, map, and player data.
              </CardDescription>
            </div>
            <Button
              onClick={handleCreateBackup}
              disabled={creatingBackup || !backupStatus?.savesExists}
              className="gap-2"
            >
              {creatingBackup ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
              {creatingBackup ? "Creating..." : "Backup Now"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {backupStatus && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-xl">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  {backupStatus.savesExists ? (
                    <span className="text-primary">Saves folder found</span>
                  ) : (
                    <span className="text-destructive">
                      Saves folder not found
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  {backupStatus.backupCount} backup
                  {backupStatus.backupCount !== 1 ? "s" : ""} stored
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  {backupStatus.lastBackup
                    ? `Last: ${new Date(backupStatus.lastBackup.created).toLocaleString()}`
                    : "No backups yet"}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Scheduled Backups</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically backup your world on a schedule
                </p>
              </div>
              <Switch
                checked={backupStatus?.enabled || false}
                onCheckedChange={toggleBackupEnabled}
                disabled={backupLoading}
                aria-label="Enable scheduled backups"
              />
            </div>

            {backupStatus?.enabled && (
              <div className="grid grid-cols-1 gap-4 border-l-2 border-primary/20 pl-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="backup-schedule">Schedule</Label>
                  <Input
                    id="backup-schedule"
                    value={backupSchedule}
                    onChange={(e) => setBackupSchedule(e.target.value)}
                    placeholder="0 */6 * * *"
                    className="font-mono"
                    maxLength={100}
                  />
                  <p className="text-xs text-muted-foreground">
                    Default: every 6 hours. Uses cron format: minute hour day
                    month weekday.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="backup-max">Max Backups to Keep</Label>
                  <Input
                    id="backup-max"
                    type="number"
                    min={1}
                    max={100}
                    value={backupMaxCount}
                    onChange={(e) =>
                      setBackupMaxCount(parseInt(e.target.value) || 10)
                    }
                    onBlur={(e) => {
                      const v = parseInt(e.target.value);
                      if (!Number.isFinite(v) || v < 1) setBackupMaxCount(1);
                      else if (v > 100) setBackupMaxCount(100);
                    }}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="max-w-24"
                    inputMode="numeric"
                  />
                  <p className="text-xs text-muted-foreground">
                    The panel deletes the oldest backups when this limit is
                    reached.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <Button
                    onClick={handleSaveBackupSettings}
                    disabled={backupLoading}
                    variant="outline"
                    size="sm"
                  >
                    {backupLoading && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Save Schedule Settings
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-base font-medium">Existing Backups</p>
            <BackupList
              backups={backups}
              restoringBackup={restoringBackup}
              restoreConfirmBackup={restoreConfirmBackup}
              setRestoreConfirmBackup={setRestoreConfirmBackup}
              handleRestoreBackup={handleRestoreBackup}
              handleDeleteBackup={handleDeleteBackup}
            />
          </div>

          {backupStatus?.savesPath && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                <strong>Saves:</strong> {backupStatus.savesPath}
              </p>
              <p>
                <strong>Backups:</strong> {backupStatus.backupsPath}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

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
              <Label htmlFor="auto-export-on-login" className="text-sm font-medium">
                Export a character when a player joins
              </Label>
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
              <Label htmlFor="auto-export-max">Copies kept per player</Label>
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
    </>
  );
}
