import { useCallback, useEffect, useState } from "react";
import { backupApi, BackupStatus, BackupFile } from "@/lib/api";
import { reportClientError } from "@/lib/client-errors";
import { useToast } from "@/components/ui/use-toast";
import { isValidCron } from "@/lib/settingsFormat";

// World backups tab: status, backup list, schedule form, and the
// create/restore/delete actions.
export function useBackupSettings() {
  const { toast } = useToast();
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null);
  const [restoreConfirmBackup, setRestoreConfirmBackup] = useState<
    string | null
  >(null);
  const [backupSchedule, setBackupSchedule] = useState("0 */6 * * *");
  const [backupMaxCount, setBackupMaxCount] = useState(10);

  const fetchBackupStatus = useCallback(async () => {
    try {
      const status = await backupApi.getStatus();
      setBackupStatus(status);
      setBackupSchedule(status.schedule);
      setBackupMaxCount(status.maxBackups);
    } catch (error) {
      reportClientError("Failed to fetch backup status.", error);
    }
  }, []);

  const fetchBackups = useCallback(async () => {
    try {
      const data = await backupApi.listBackups();
      setBackups(data.backups || []);
    } catch (error) {
      reportClientError("Failed to fetch backups.", error);
    }
  }, []);

  useEffect(() => {
    fetchBackupStatus();
    fetchBackups();
  }, [fetchBackupStatus, fetchBackups]);

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const result = await backupApi.createBackup();
      if (result.success && result.backup) {
        toast({
          title: "Backup Created",
          description: `Created ${('filename' in result.backup ? result.backup.filename : result.backup.fileName) || 'backup'} in ${result.duration?.toFixed(1)}s`,
          variant: "success" as const,
        });
        await fetchBackups();
        await fetchBackupStatus();
      } else {
        throw new Error(result.message || "Failed to create backup");
      }
    } catch (error) {
      toast({
        title: "Backup Failed",
        description:
          error instanceof Error ? error.message : "Failed to create backup",
        variant: "destructive",
      });
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleDeleteBackup = async (name: string) => {
    try {
      const result = await backupApi.deleteBackup(name);
      if (result.success) {
        toast({
          title: "Backup Deleted",
          description: `Deleted ${name}`,
          variant: "success" as const,
        });
        await fetchBackups();
      } else {
        throw new Error(result.message || "Failed to delete backup");
      }
    } catch (error) {
      toast({
        title: "Delete Failed",
        description:
          error instanceof Error ? error.message : "Failed to delete backup",
        variant: "destructive",
      });
    }
  };

  const handleRestoreBackup = async (name: string) => {
    setRestoringBackup(name);
    try {
      const result = await backupApi.restoreBackup(name, {
        createPreRestoreBackup: true,
      });
      if (result.success) {
        toast({
          title: "Backup Restored",
          description: `Restored ${name} in ${(result.duration || 0).toFixed(1)}s`,
          variant: "success" as const,
        });
        await fetchBackups();
      } else {
        throw new Error(result.message || "Failed to restore backup");
      }
    } catch (error) {
      toast({
        title: "Restore Failed",
        description:
          error instanceof Error ? error.message : "Failed to restore backup",
        variant: "destructive",
      });
    } finally {
      setRestoringBackup(null);
      setRestoreConfirmBackup(null);
    }
  };

  const handleSaveBackupSettings = async () => {
    if (!isValidCron(backupSchedule)) {
      toast({
        title: "Invalid Schedule",
        description: "Please enter a valid cron expression (e.g., 0 */6 * * *)",
        variant: "destructive",
      });
      return;
    }

    setBackupLoading(true);
    try {
      await backupApi.updateSettings({
        enabled: backupStatus?.enabled || false,
        schedule: backupSchedule,
        maxBackups: backupMaxCount,
      });
      await fetchBackupStatus();
      toast({
        title: "Backup Settings Saved",
        description: "Backup schedule and retention settings were updated.",
        variant: "success" as const,
      });
    } catch (error) {
      toast({
        title: "Could Not Save Backup Settings",
        description:
          error instanceof Error
            ? error.message
            : "The panel could not save backup schedule settings. Try again.",
        variant: "destructive",
      });
    } finally {
      setBackupLoading(false);
    }
  };

  const toggleBackupEnabled = async (enabled: boolean) => {
    setBackupLoading(true);
    try {
      await backupApi.updateSettings({ enabled });
      await fetchBackupStatus();
      toast({
        title: enabled
          ? "Scheduled Backups Enabled"
          : "Scheduled Backups Disabled",
        description: enabled
          ? "The panel will create backups on the configured schedule."
          : "Automatic backups are off. Manual backups are still available.",
        variant: "success" as const,
      });
    } catch (error) {
      toast({
        title: "Could Not Update Backups",
        description:
          error instanceof Error
            ? error.message
            : "The panel could not update scheduled backup status. Try again.",
        variant: "destructive",
      });
    } finally {
      setBackupLoading(false);
    }
  };

  return {
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
  };
}
