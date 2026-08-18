import {
  Archive,
  HardDrive,
  Clock,
  Download,
  Trash2,
  RotateCcw,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'
import { BackupFile } from '@/lib/api'
import { formatBytes, formatDate } from '@/components/backup/formatUtils'

interface BackupFileListProps {
  backups: BackupFile[]
  selectedBackups: Set<string>
  allSelected: boolean
  isAnySelected: boolean
  restoringBackup: string | null
  creatingBackup: boolean
  deletingBackups: boolean
  deletingOlder: boolean
  savesExists: boolean
  loading: boolean
  onToggleSelection: (name: string) => void
  onToggleSelectAll: () => void
  onRestore: (name: string) => void
  onDownload: (name: string) => void
  onDeleteSelected: (names: string[]) => void
  onDeleteOlderOpen: () => void
  onCreateBackup: () => void
}

export function BackupFileList({
  backups,
  selectedBackups,
  allSelected,
  isAnySelected,
  restoringBackup,
  creatingBackup,
  deletingBackups,
  deletingOlder,
  savesExists,
  loading,
  onToggleSelection,
  onToggleSelectAll,
  onRestore,
  onDownload,
  onDeleteSelected,
  onDeleteOlderOpen,
  onCreateBackup,
}: BackupFileListProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">Backup Files</CardTitle>
            {!savesExists && (
              <span className="flex items-center gap-1 text-xs text-warning">
                <AlertTriangle className="w-3 h-3" />
                Saves folder not found
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAnySelected && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onDeleteSelected(Array.from(selectedBackups))}
                disabled={deletingBackups}
                className="h-10 gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete ({selectedBackups.size})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onDeleteOlderOpen}
              disabled={deletingOlder || backups.length === 0}
              className="h-10 gap-2"
            >
              {deletingOlder ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Clock className="w-4 h-4" />
              )}
              Delete Older
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : backups.length === 0 ? (
          <EmptyState type="noData" title="No safety net" description="Create a backup before changing saves, mods, or server settings — one bad update away from lost progress." action={{ label: 'Create Backup', onClick: onCreateBackup, variant: 'default' }} />
        ) : (
          <div className="space-y-2">
            {/* Select All Header */}
            <div className="flex items-center gap-3 px-3 py-2.5 border border-border/50 bg-muted/20 rounded-lg">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleSelectAll}
                id="select-all"
              />
              <Label htmlFor="select-all" className="text-sm font-medium cursor-pointer flex-1">
                {selectedBackups.size === 0
                  ? `Select all · ${backups.length} backup${backups.length === 1 ? '' : 's'}`
                  : allSelected
                    ? `All ${backups.length} selected · click to clear`
                    : `${selectedBackups.size} of ${backups.length} selected`}
              </Label>
              {selectedBackups.size > 0 && (
                <span className="inline-flex h-5 items-center rounded-full bg-primary/15 px-2 font-mono text-[11px] tabular-nums text-primary">
                  {selectedBackups.size}
                </span>
              )}
            </div>

            {/* Backup List */}
            <ScrollArea className="h-[300px] sm:h-[400px]">
              <div className="space-y-2 pr-4">
                {backups.map((backup, idx) => {
                  const isSelected = selectedBackups.has(backup.name)
                  const isRestoring = restoringBackup === backup.name
                  const isLatest = idx === 0

                  return (
                    <div
                      key={backup.name}
                      className={cn(
                        'group/backup flex items-center gap-3 p-3 rounded-lg border transition-colors',
                        isSelected
                          ? 'border-primary/40 bg-primary/[0.08]'
                          : 'bg-muted/20 border-border/40 hover:border-primary/30 hover:bg-muted/40'
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelection(backup.name)}
                        disabled={isRestoring}
                        aria-label={`Select backup ${backup.name}`}
                      />

                      <div
                        className={cn(
                          'grid place-items-center w-9 h-9 rounded-md border shrink-0',
                          isLatest
                            ? 'border-primary/40 bg-primary/[0.08] text-primary'
                            : 'border-border/55 bg-muted/30 text-muted-foreground'
                        )}
                        aria-hidden="true"
                      >
                        <Archive className="w-4 h-4" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{backup.name}</p>
                          {isLatest && (
                            <span className="shrink-0 inline-flex h-5 items-center rounded-full bg-primary/15 px-2 text-[10px] font-medium uppercase tracking-wide text-primary">
                              Latest
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <HardDrive className="w-3 h-3" />
                            {formatBytes(backup.size)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(backup.created)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRestore(backup.name)}
                          disabled={isRestoring || restoringBackup !== null || creatingBackup}
                          className="h-9 w-9 text-warning hover:text-warning hover:bg-warning/10"
                          aria-label={`Restore ${backup.name}`}
                          title="Restore this backup"
                        >
                          {isRestoring ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDownload(backup.name)}
                          className="h-9 w-9"
                          aria-label={`Download ${backup.name}`}
                          title="Download backup"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteSelected([backup.name])}
                          disabled={deletingBackups}
                          className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                          aria-label={`Delete ${backup.name}`}
                          title="Delete backup"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
