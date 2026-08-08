import { AlertTriangle, Archive, Download, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/EmptyState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { backupApi, BackupFile } from "@/lib/api";
import { formatBytes } from "@/lib/settingsFormat";

interface BackupListProps {
  backups: BackupFile[];
  restoringBackup: string | null;
  restoreConfirmBackup: string | null;
  setRestoreConfirmBackup: (name: string | null) => void;
  handleRestoreBackup: (name: string) => Promise<void>;
  handleDeleteBackup: (name: string) => Promise<void>;
}

export function BackupList({
  backups,
  restoringBackup,
  restoreConfirmBackup,
  setRestoreConfirmBackup,
  handleRestoreBackup,
  handleDeleteBackup,
}: BackupListProps) {
  if (backups.length === 0) {
    return (
      <EmptyState
        compact
        type="empty"
        title="No backups yet"
        description='Click "Backup Now" to create one.'
      />
    );
  }

  return (
    <ScrollArea className="h-[200px] rounded-lg border">
      <div className="p-2 space-y-2">
        {backups.map((backup) => (
          <div
            key={backup.name}
            className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Archive className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{backup.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(backup.size)} •{" "}
                  {new Date(backup.created).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <AlertDialog
                open={restoreConfirmBackup === backup.name}
                onOpenChange={(open) => !open && setRestoreConfirmBackup(null)}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRestoreConfirmBackup(backup.name)}
                    disabled={restoringBackup !== null}
                    className="text-warning hover:text-warning hover:bg-warning/10"
                    title="Restore this backup (server must be stopped)"
                  >
                    {restoringBackup === backup.name ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-warning" />
                      Restore Backup
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-left space-y-2">
                      <p>
                        This will restore <strong>{backup.name}</strong> and{" "}
                        <strong>OVERWRITE</strong> the current world data.
                      </p>
                      <ul className="list-disc list-inside text-sm space-y-1">
                        <li>
                          Server must be <strong>STOPPED</strong>
                        </li>
                        <li>A pre-restore backup will be created</li>
                        <li>This cannot be undone</li>
                      </ul>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleRestoreBackup(backup.name)}
                      className="bg-warning text-warning-foreground hover:bg-warning/90"
                    >
                      Restore Backup
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => backupApi.downloadBackup(backup.name)}
              >
                <Download className="w-4 h-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Backup</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{backup.name}"? This
                      action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDeleteBackup(backup.name)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
