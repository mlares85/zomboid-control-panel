import { useEffect, useState } from 'react'
import { Loader2, Download, RotateCcw, AlertTriangle, Package } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { backupApi, BackupRecord } from '@/lib/api'
import { formatBytes, formatDate } from './formatUtils'

interface BackupDetailPanelProps {
  backupId: string | null
  onOpenChange: (open: boolean) => void
  onRestore: (fileName: string) => void
  restoring?: boolean
}

// Renders a snapshot's sandbox/INI key-value pairs as a compact grid, one
// row per setting. Shared by both the sandbox and INI sections below.
function SettingsGrid({ values }: { values: Record<string, unknown> }) {
  const entries = Object.entries(values)
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">Not captured with this backup.</p>
  }
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground truncate">{key}</dt>
          <dd className="font-mono text-right truncate">{String(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

// Fetches the full record (including serverSnapshot) on open, since the
// History table's list view only carries the lightweight summary fields.
function useBackupDetail(backupId: string | null) {
  const [record, setRecord] = useState<BackupRecord | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!backupId) {
      setRecord(null)
      return
    }
    setLoading(true)
    backupApi
      .getRecord(backupId)
      .then((data) => setRecord(data.record))
      .catch(() => setRecord(null))
      .finally(() => setLoading(false))
  }, [backupId])

  return { record, loading }
}

export function BackupDetailPanel({ backupId, onOpenChange, onRestore, restoring }: BackupDetailPanelProps) {
  const { record, loading } = useBackupDetail(backupId)
  const snapshot = record?.serverSnapshot

  return (
    <Dialog open={backupId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Backup Details</DialogTitle>
          <DialogDescription>
            {record ? `${formatDate(record.timestamp)} · ${record.type}` : 'Loading backup record...'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !record ? (
          <p className="text-sm text-destructive">Could not load this backup record.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Server</p>
                <p className="font-medium">{snapshot?.serverName || record.serverName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Provider</p>
                <p className="font-medium">{snapshot?.provider || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Template Used</p>
                <p className="font-medium">{snapshot?.template || 'None recorded'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Players at Backup Time</p>
                <p className="font-medium">{snapshot?.playerCount ?? 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">World Age</p>
                <p className="font-medium">{snapshot?.worldAge || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Save Size</p>
                <p className="font-medium">
                  {snapshot?.saveSize != null ? formatBytes(snapshot.saveSize) : formatBytes(record.originalSize)}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                Sandbox Settings
              </p>
              <SettingsGrid values={snapshot?.sandboxVars || {}} />
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                Server INI
              </p>
              <SettingsGrid values={snapshot?.serverIni || {}} />
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" />
                Mods ({snapshot?.mods.length ?? 0})
              </p>
              {!snapshot?.mods.length ? (
                <p className="text-xs text-muted-foreground">No mods tracked at backup time.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {snapshot.mods.map((mod) => (
                    <Badge key={mod.workshopId} variant="secondary" className="font-normal">
                      {mod.name || mod.workshopId}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {!record.fileName && (
              <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                This backup has no local file on record — restore/download are unavailable.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {record?.fileName && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => backupApi.downloadBackup(record.fileName as string)}
              >
                <Download className="w-4 h-4" />
                Download
              </Button>
              <Button
                size="sm"
                className="gap-2"
                disabled={restoring}
                onClick={() => onRestore(record.fileName as string)}
              >
                {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                Restore
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
