import {
  Archive,
  Loader2,
  Upload,
  Settings,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/PageHeader'
import { BackupFormatId } from '@/lib/api'

interface BackupPageHeaderProps {
  backupFormat: BackupFormatId
  onFormatChange: (format: BackupFormatId) => void
  creatingBackup: boolean
  restoringBackup: string | null
  uploadingBackup: boolean
  uploadPercent: number
  savesExists: boolean
  activeServerRemote: boolean
  loading: boolean
  onCreateBackup: () => void
  onUploadClick: () => void
  onToggleSettings: () => void
  onRefresh: () => void
}

export function BackupPageHeader({
  backupFormat,
  onFormatChange,
  creatingBackup,
  restoringBackup,
  uploadingBackup,
  uploadPercent,
  savesExists,
  activeServerRemote,
  loading,
  onCreateBackup,
  onUploadClick,
  onToggleSettings,
  onRefresh,
}: BackupPageHeaderProps) {
  return (
    <PageHeader
      title="World Backups"
      description="Create, restore, and manage your server world backups"
      icon={<Archive className="w-5 h-5 text-primary" />}
      actions={
        <div className="flex items-center gap-2">
          <Select value={backupFormat} onValueChange={(v) => onFormatChange(v as BackupFormatId)}>
            <SelectTrigger className="w-28" aria-label="Backup format" disabled={creatingBackup}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zip">.zip</SelectItem>
              <SelectItem value="tar.gz">.tar.gz</SelectItem>
              <SelectItem value="tar.zst">.tar.zst</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={onCreateBackup}
            disabled={creatingBackup || restoringBackup !== null || !savesExists || activeServerRemote}
            className="gap-2"
            title={activeServerRemote ? 'Backups are not available for remote servers' : undefined}
          >
            {creatingBackup ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Archive className="w-4 h-4" />
            )}
            {creatingBackup ? 'Creating...' : 'Create Backup'}
          </Button>
          <Button
            variant="outline"
            onClick={onUploadClick}
            disabled={uploadingBackup || restoringBackup !== null || activeServerRemote}
            className="gap-2"
            title={activeServerRemote ? 'Backups are not available for remote servers' : 'Upload an existing world_backup_*.zip from another machine'}
          >
            {uploadingBackup ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {uploadingBackup ? `Uploading ${uploadPercent}%` : 'Upload .zip'}
          </Button>
          <Button
            variant="outline"
            onClick={onToggleSettings}
            className="gap-2"
          >
            <Settings className="w-4 h-4" />
            Settings
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh backup status"
            title="Refresh backup status"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </Button>
        </div>
      }
    />
  )
}
