import {
  AlertTriangle,
  Trash2,
  Clock,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface BackupDialogsProps {
  restoreDialog: { open: boolean; backupName: string | null }
  onRestoreDialogChange: (open: boolean) => void
  onRestoreConfirm: (name: string) => void
  deleteDialog: { open: boolean; names: string[] }
  onDeleteDialogChange: (open: boolean) => void
  onDeleteConfirm: (names: string[]) => void
  deleteOlderDialog: boolean
  onDeleteOlderDialogChange: (open: boolean) => void
  deleteOlderDays: number
  onDeleteOlderDaysChange: (days: number) => void
  onDeleteOlderConfirm: () => void
}

export function BackupDialogs({
  restoreDialog,
  onRestoreDialogChange,
  onRestoreConfirm,
  deleteDialog,
  onDeleteDialogChange,
  onDeleteConfirm,
  deleteOlderDialog,
  onDeleteOlderDialogChange,
  deleteOlderDays,
  onDeleteOlderDaysChange,
  onDeleteOlderConfirm,
}: BackupDialogsProps) {
  return (
    <>
      {/* Restore Confirmation Dialog */}
      <AlertDialog open={restoreDialog.open} onOpenChange={onRestoreDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="w-5 h-5" />
              Restore Backup
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Restore <strong>{restoreDialog.backupName}</strong>. This will <span className="font-medium text-destructive">replace</span> the current world data.
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 mt-2">
                <li>Stop the server first.</li>
                <li>The panel will create a safety backup before restoring.</li>
                <li>This action cannot be undone.</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => restoreDialog.backupName && onRestoreConfirm(restoreDialog.backupName)}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              Restore this backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={onDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Backup{deleteDialog.names.length > 1 ? 's' : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog.names.length === 1 ? (
                <p>
                  Delete <strong>{deleteDialog.names[0]}</strong>? This permanently removes the backup file.
                </p>
              ) : (
                <p>
                  Delete <strong>{deleteDialog.names.length} backups</strong>? This permanently removes those files.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDeleteConfirm(deleteDialog.names)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete backup{deleteDialog.names.length > 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Older Than Dialog */}
      <AlertDialog open={deleteOlderDialog} onOpenChange={onDeleteOlderDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning">
              <Clock className="w-5 h-5" />
              Delete Old Backups
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>Delete every backup older than the number of days you choose here.</p>
                <div className="flex items-center gap-3">
                  <Label htmlFor="delete-days" className="text-foreground whitespace-nowrap">Delete backups older than</Label>
                  <Input
                    id="delete-days"
                    type="number"
                    min={1}
                    max={365}
                    value={deleteOlderDays}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10)
                      if (!isNaN(val) && val >= 1 && val <= 365) {
                        onDeleteOlderDaysChange(val)
                      }
                    }}
                    className="w-20"
                  />
                  <span className="text-foreground">days</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  This permanently deletes backups created more than {deleteOlderDays} days ago.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteOlderConfirm}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              Delete older backups
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
