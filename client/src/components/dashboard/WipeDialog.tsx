import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/components/ui/use-toast'
import { serverApi, type ServerInstance } from '@/lib/api'
import type { WipePreview } from './types'

const WIPE_CATEGORIES = [
  ['map',      'Map & terrain',      'Chunks, terrain, buildings, zombie population, iso regions.'],
  ['players',  'Players & vehicles', 'Player saves, inventories, positions, vehicle data.'],
  ['world',    'World state',        'World dictionary, metadata, erosion, game object states, radio.'],
  ['accounts', 'Accounts & bans',    'User accounts, passwords, roles, whitelist and ban lists. Everyone re-registers on next join.'],
] as const

interface Props {
  open: boolean
  onClose: () => void
  activeServer: ServerInstance | null
  targets: Record<string, boolean>
  onTargetsChange: (next: Record<string, boolean>) => void
  preview: WipePreview | null
  onPreviewChange: (next: WipePreview | null) => void
}

function PreviewSummary({ preview }: { preview: WipePreview }) {
  if (preview.totalFiles === 0) {
    return <div className="text-muted-foreground">No files found for the selected targets.</div>
  }
  const labels: Record<string, string> = { map: 'map/terrain', players: 'player/vehicle', world: 'world state', leftovers: 'other leftover', accounts: 'account database' }
  return (
    <>
      <div className="font-medium text-destructive">This will permanently delete:</div>
      {(['map', 'players', 'world', 'leftovers', 'accounts'] as const).map(key => {
        const data = preview.preview?.[key]
        if (!data) return null
        return data.files > 0
          ? <div key={key}>{data.files.toLocaleString()} {labels[key]} files ({(data.size / 1024 / 1024).toFixed(1)} MB)</div>
          : key !== 'leftovers' ? <div key={key} className="text-muted-foreground">No {labels[key]} files found</div> : null
      })}
      <div className="pt-1 font-medium">Total: {preview.totalFiles.toLocaleString()} files ({(preview.totalSize / 1024 / 1024).toFixed(1)} MB)</div>
    </>
  )
}

export function WipeDialog({ open, onClose, activeServer, targets, onTargetsChange, preview, onPreviewChange }: Props) {
  const { toast } = useToast()
  const [wipeLoading, setWipeLoading] = useState(false)

  const selectedTargets = () => Object.entries(targets).filter(([, v]) => v).map(([k]) => k)

  const handlePreview = async () => {
    if (wipeLoading) return
    setWipeLoading(true)
    try {
      const res = await serverApi.wipePreview(selectedTargets())
      onPreviewChange(res)
    } catch (e: unknown) {
      toast({ title: 'Preview failed', description: e instanceof Error ? e.message : 'Could not scan save directory', variant: 'destructive' })
    } finally { setWipeLoading(false) }
  }

  const handleWipe = async () => {
    if (wipeLoading) return
    setWipeLoading(true)
    try {
      const t = selectedTargets()
      await serverApi.wipe(t)
      toast({ title: 'Server wiped', description: `Deleted: ${t.join(', ')}` })
      onClose()
    } catch (e: unknown) {
      toast({ title: 'Wipe failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' })
    } finally { setWipeLoading(false) }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o && !wipeLoading) onClose() }}>
      <AlertDialogContent className="glass border-border/50">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-3 text-xl">
            <Trash2 className="h-5 w-5 text-destructive" /> Wipe server
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            Select what data to delete from <span className="font-medium text-foreground">{activeServer?.serverName || 'the active server'}</span>. The server must be stopped.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          {WIPE_CATEGORIES.map(([key, label, desc]) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 rounded-md border border-border/50 p-3 hover:bg-muted/30">
              <Checkbox
                checked={targets[key]}
                disabled={wipeLoading}
                onCheckedChange={(checked) => { onTargetsChange({ ...targets, [key]: checked === true }); onPreviewChange(null) }}
              />
              <div className="min-w-0">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </div>
            </label>
          ))}
          <div className="px-3 pb-1 text-xs text-muted-foreground">
            Selecting map, players and world empties the save folder completely, including anything mods left behind. Server .ini and sandbox settings are stored separately and will not be affected.
          </div>
        </div>

        {preview && (
          <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <PreviewSummary preview={preview} />
          </div>
        )}

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel className="mt-0" disabled={wipeLoading} onClick={onClose}>Cancel</AlertDialogCancel>
          {!preview ? (
            <Button variant="warning" disabled={!Object.values(targets).some(Boolean) || wipeLoading} onClick={handlePreview}>
              {wipeLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Preview
            </Button>
          ) : (
            <Button variant="destructive" disabled={wipeLoading || preview.totalFiles === 0} onClick={handleWipe}>
              {wipeLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Wipe now
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
