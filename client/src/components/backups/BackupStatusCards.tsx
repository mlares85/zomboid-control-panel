import { Archive, HardDrive, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { formatBytes, formatDate, describeSchedule } from '@/components/backup/formatUtils'
import type { BackupFile, BackupStatus } from '@/lib/api'
import { FieldHelp } from '@/components/FieldHelp'

interface BackupStatusCardsProps {
  backups: BackupFile[]
  backupStatus: BackupStatus | null
  totalSize: number
  onToggleEnabled: (enabled: boolean) => void
}

export function BackupStatusCards({ backups, backupStatus, totalSize, onToggleEnabled }: BackupStatusCardsProps) {
  if (backups.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-in">
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="grid place-items-center w-10 h-10 rounded-md border border-primary/30 bg-primary/[0.06] text-primary shrink-0" aria-hidden="true">
            <Archive className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Backups</p>
            <p className="text-xl font-semibold leading-tight mt-0.5 text-foreground">{backups.length}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="grid place-items-center w-10 h-10 rounded-md border border-border/55 bg-muted/30 text-muted-foreground shrink-0" aria-hidden="true">
            <HardDrive className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Size</p>
            <p className="text-xl font-semibold leading-tight mt-0.5 text-foreground tabular-nums">{formatBytes(totalSize)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="grid place-items-center w-10 h-10 rounded-md border border-primary/30 bg-primary/[0.06] text-primary shrink-0" aria-hidden="true">
            <Clock className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Last Backup</p>
            <p className="text-sm font-semibold leading-tight mt-0.5 text-foreground truncate">
              {backupStatus?.lastBackup ? formatDate(backupStatus.lastBackup.created) : 'Never'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div
            className={cn(
              'grid place-items-center w-10 h-10 rounded-md border shrink-0',
              backupStatus?.enabled
                ? 'border-primary/30 bg-primary/[0.06] text-primary'
                : 'border-border/55 bg-muted/30 text-muted-foreground'
            )}
            aria-hidden="true"
          >
            <Clock className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              Auto-Backup
              <FieldHelp
                description="Enables the scheduled backup job configured in Backup Settings."
                context="When off, backups only happen when you click Create Backup manually — turn this on if you want protection without remembering to do it yourself."
                recommendation="must-configure"
                articleId="scheduled-backups"
              />
            </p>
            <p className={cn('text-sm font-semibold leading-tight mt-0.5 truncate', backupStatus?.enabled ? 'text-foreground' : 'text-muted-foreground')}>
              {backupStatus?.enabled ? 'On' : 'Off'}
            </p>
            <p className="text-[11px] text-muted-foreground/80 truncate" title={backupStatus?.schedule || ''}>
              {backupStatus?.enabled
                ? `Runs ${describeSchedule(backupStatus?.schedule)} · keep ${backupStatus?.maxBackups ?? '?'}`
                : 'No scheduled backups'}
            </p>
          </div>
          <Switch
            checked={backupStatus?.enabled || false}
            onCheckedChange={onToggleEnabled}
            aria-label="Toggle scheduled backups"
          />
        </CardContent>
      </Card>
    </div>
  )
}
