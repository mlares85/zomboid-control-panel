import { useState } from 'react'
import {
  Archive,
  Loader2,
  Upload,
  Settings,
  RefreshCw,
  HardDrive,
  Server,
  Cloud,
  Check,
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
import { BackupFormatId, type BackupDestination } from '@/lib/api'
import { FieldHelp } from '@/components/FieldHelp'

const DEST_ICONS: Record<string, typeof HardDrive> = {
  local: HardDrive,
  sftp: Server,
  'google-drive': Cloud,
}

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
  destinations: BackupDestination[]
  selectedDestinations: Set<string>
  onToggleDestination: (id: string) => void
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
  destinations,
  selectedDestinations,
  onToggleDestination,
  onCreateBackup,
  onUploadClick,
  onToggleSettings,
  onRefresh,
}: BackupPageHeaderProps) {
  const [destMenuOpen, setDestMenuOpen] = useState(false)
  const enabledDests = destinations.filter((d) => d.enabled && d.implemented)
  const selectedCount = selectedDestinations.size

  return (
    <PageHeader
      title="World Backups"
      description="Create, restore, and manage your server world backups"
      icon={<Archive className="w-5 h-5 text-primary" />}
      actions={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
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
            <FieldHelp
              description="Compression format used for manually created backups."
              context=".zip is the most compatible everywhere. .tar.gz and .tar.zst produce smaller files but need standard Linux tools (tar) to extract."
              recommendation="safe-default"
              articleId="backups-overview"
            />
          </div>
          {/* Destination picker — only show when there are multiple destinations */}
          {enabledDests.length > 1 && (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDestMenuOpen((v) => !v)}
                disabled={creatingBackup}
                className="gap-1.5 text-xs"
                title="Choose where to save the backup"
              >
                <HardDrive className="w-3.5 h-3.5" />
                {selectedCount === 1
                  ? enabledDests.find((d) => selectedDestinations.has(d.id))?.name || 'Local'
                  : `${selectedCount} destinations`}
              </Button>
              {destMenuOpen && (
                <DestinationMenu
                  destinations={enabledDests}
                  selected={selectedDestinations}
                  onToggle={onToggleDestination}
                  onClose={() => setDestMenuOpen(false)}
                />
              )}
            </div>
          )}
          <Button
            onClick={onCreateBackup}
            disabled={creatingBackup || restoringBackup !== null || !savesExists || activeServerRemote || selectedCount === 0}
            className="gap-2"
            title={
              activeServerRemote ? 'Backups are not available for remote servers'
                : selectedCount === 0 ? 'Select at least one destination'
                : undefined
            }
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

// Dropdown multi-select for backup destinations
function DestinationMenu({
  destinations,
  selected,
  onToggle,
  onClose,
}: {
  destinations: BackupDestination[]
  selected: Set<string>
  onToggle: (id: string) => void
  onClose: () => void
}) {
  // Close when clicking outside
  const handleClickOutside = () => {
    // Small delay so the toggle button click doesn't re-open
    setTimeout(onClose, 0)
  }

  return (
    <>
      {/* Invisible backdrop */}
      <div className="fixed inset-0 z-40" onClick={handleClickOutside} />
      <div className="absolute right-0 top-full mt-1 w-52 rounded-md border border-border/60 bg-popover shadow-lg z-50 overflow-hidden">
        <div className="px-2.5 py-1.5 border-b border-border/30 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60">
          save backup to
        </div>
        {destinations.map((dest) => {
          const Icon = DEST_ICONS[dest.type] || HardDrive
          const isSelected = selected.has(dest.id)
          return (
            <button
              key={dest.id}
              onClick={() => onToggle(dest.id)}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-2 text-left text-sm hover:bg-muted/60 transition-colors',
                isSelected && 'bg-muted/30'
              )}
            >
              <div className={cn(
                'w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors',
                isSelected
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-border'
              )}>
                {isSelected && <Check className="w-3 h-3" />}
              </div>
              <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{dest.name}</div>
                {dest.type !== 'local' && (
                  <div className="truncate text-[10px] text-muted-foreground/60">{dest.type}</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}
