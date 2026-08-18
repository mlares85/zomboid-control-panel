import { Check, AlertTriangle, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { BackupProgress } from '@/hooks/backups/useBackupsData'

interface BackupProgressCardProps {
  backupProgress: BackupProgress | null
  creatingBackup: boolean
}

export function BackupProgressCard({ backupProgress, creatingBackup }: BackupProgressCardProps) {
  if (!creatingBackup && !backupProgress) return null

  return (
    <Card className="border-primary/15 bg-primary/5">
      <CardContent className="pt-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {backupProgress?.phase === 'complete' ? (
                <Check className="w-5 h-5 text-primary" />
              ) : backupProgress?.phase === 'error' ? (
                <AlertTriangle className="w-5 h-5 text-destructive" />
              ) : (
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              )}
              <span className="font-medium">
                {backupProgress?.message || 'Creating backup...'}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              {backupProgress?.percent || 0}%
            </span>
          </div>
          <Progress value={backupProgress?.percent || 0} className="h-2" />
          {backupProgress?.currentFile && (
            <p className="text-xs text-muted-foreground truncate">
              {backupProgress.currentFile}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
