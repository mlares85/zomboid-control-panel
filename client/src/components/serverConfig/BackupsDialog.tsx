import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Filter, RotateCcw, Upload } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { BackupFilter } from '@/hooks/serverConfig/useConfigBackups'

interface BackupFile { filename: string; size: number; created: string }

function matchesFilter(backup: BackupFile, filter: BackupFilter): boolean {
  if (filter === 'all') return true
  const filename = backup.filename.toLowerCase()
  if (filter === 'ini') return filename.includes('_ini_') || filename.endsWith('.ini')
  if (filter === 'sandbox') return filename.includes('sandbox')
  if (filter === 'spawnpoints') return filename.includes('spawnpoints')
  if (filter === 'spawnregions') return filename.includes('spawnregions')
  return true
}

function fileTypeBadge(filename: string): { fileType: string; typeColor: string } {
  const lower = filename.toLowerCase()
  if (lower.includes('_ini_') || lower.endsWith('.ini')) return { fileType: 'INI', typeColor: 'bg-primary' }
  if (lower.includes('sandbox')) return { fileType: 'Sandbox', typeColor: 'bg-chart-4' }
  if (lower.includes('spawnpoints')) return { fileType: 'SpawnPoints', typeColor: 'bg-accent-foreground' }
  if (lower.includes('spawnregions')) return { fileType: 'SpawnRegions', typeColor: 'bg-warning' }
  return { fileType: 'config', typeColor: 'bg-muted-foreground' }
}

export function BackupsDialog({
  open,
  onOpenChange,
  backups,
  backupFilter,
  setBackupFilter,
  onRestore,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  backups: BackupFile[]
  backupFilter: BackupFilter
  setBackupFilter: (filter: BackupFilter) => void
  onRestore: (filename: string) => void
}) {
  const filtered = backups.filter(b => matchesFilter(b, backupFilter))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5" />
            Configuration Backups
          </DialogTitle>
          <DialogDescription>
            Restore a previous version of your configuration files. Backups are created automatically when you save.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b pb-3">
          <span className="text-sm text-muted-foreground mr-2">
            <Filter className="w-4 h-4 inline mr-1" />
            Filter:
          </span>
          {(['all', 'ini', 'sandbox', 'spawnpoints', 'spawnregions'] as const).map((filter) => (
            <Button
              key={filter}
              variant={backupFilter === filter ? 'default' : 'outline'}
              size="sm"
              onClick={() => setBackupFilter(filter)}
              className="capitalize"
            >
              {filter === 'all' ? 'All Files' : filter}
            </Button>
          ))}
        </div>

        <ScrollArea className="h-[400px]">
          {backups.length === 0 ? (
            <EmptyState type="noData" title="No backups available yet" description="Backups are created automatically when you save any config file" compact />
          ) : (
            <div className="space-y-2">
              {filtered.map((backup) => {
                const { fileType, typeColor } = fileTypeBadge(backup.filename)
                return (
                  <div key={backup.filename} className="flex flex-col gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3 sm:items-center">
                      <Badge className={`${typeColor} text-white text-xs`}>{fileType}</Badge>
                      <div className="min-w-0">
                        <p className="break-all text-sm font-medium font-mono" dir="auto" title={backup.filename}>{backup.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(backup.created).toLocaleString()} • {Math.round(backup.size / 1024)}KB
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => onRestore(backup.filename)}>
                              <Upload className="w-4 h-4 mr-1" />
                              Restore
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Replace current file with this backup</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                )
              })}
              {filtered.length === 0 && backups.length > 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No backups found for "{backupFilter}" files.</p>
                  <Button variant="link" size="sm" onClick={() => setBackupFilter('all')}>Show all backups</Button>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {backups.length} backup{backups.length !== 1 ? 's' : ''} total
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
