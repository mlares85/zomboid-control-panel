import { useState } from 'react'
import { AlertTriangle, Archive, Loader2, Scissors } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { useToast } from '@/components/ui/use-toast'
import { backupApi, CompactionPreview, CompactionResult } from '@/lib/api'

export function SaveCompactionCard() {
  const { toast } = useToast()
  const [staleDays, setStaleDays] = useState(30)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<CompactionPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<CompactionResult | null>(null)

  const handlePreview = async () => {
    setPreviewing(true)
    setPreviewError(null)
    setResult(null)
    try {
      const data = await backupApi.previewCompaction({ staleDays })
      if (data.success) {
        setPreview(data)
      } else {
        setPreview(null)
        setPreviewError('No active save is configured, so there is nothing to preview.')
      }
    } catch (error) {
      setPreview(null)
      setPreviewError(error instanceof Error ? error.message : 'Failed to preview compaction')
    } finally {
      setPreviewing(false)
    }
  }

  const handleApply = async () => {
    setConfirmOpen(false)
    setApplying(true)
    try {
      const data = await backupApi.applyCompaction({ staleDays, createBackup: true })
      setResult(data)
      if (data.success) {
        toast({ title: 'Save Compacted', description: `Freed ${data.spaceFreedFormatted} across ${data.deleted} file(s).`, variant: 'success' as const })
        setPreview(null)
      } else {
        toast({ title: 'Compaction Failed', description: data.message || 'Failed to compact save data', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Compaction Failed', description: error instanceof Error ? error.message : 'Failed to compact save data', variant: 'destructive' })
    } finally {
      setApplying(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Scissors className="w-5 h-5" />
          Save Compaction
        </CardTitle>
        <CardDescription>Removes stale save chunk data older than a cutoff to reclaim disk space.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="stale-days">Stale after (days)</Label>
            <Input
              id="stale-days"
              type="number"
              min={1}
              max={365}
              value={staleDays}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!isNaN(val) && val >= 1 && val <= 365) setStaleDays(val)
              }}
              className="w-24"
            />
          </div>
          <Button variant="outline" onClick={handlePreview} disabled={previewing} className="gap-2">
            {previewing && <Loader2 className="w-4 h-4 animate-spin" />}
            Preview
          </Button>
        </div>

        {previewError && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{previewError}</span>
          </div>
        )}

        {preview && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-md border border-border/50 bg-muted/20 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Size</p>
              <p className="text-sm font-semibold mt-0.5">{preview.totalSizeFormatted}</p>
            </div>
            <div className="rounded-md border border-border/50 bg-muted/20 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Stale Size</p>
              <p className="text-sm font-semibold mt-0.5">{preview.staleSizeFormatted}</p>
              <p className="text-xs text-muted-foreground">{preview.staleChunkCount} of {preview.totalChunkCount} chunks</p>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/[0.06] p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Estimated Savings</p>
              <p className="text-sm font-semibold mt-0.5 text-primary">{preview.estimatedSavingsPercent}%</p>
            </div>
          </div>
        )}

        {result && (
          <div className="flex items-center gap-2 rounded-md border border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.1)] px-3 py-2 text-xs text-[hsl(var(--success))]">
            <Archive className="w-3.5 h-3.5 shrink-0" />
            <span>
              Deleted {result.deleted} file(s), freed {result.spaceFreedFormatted}.
              {result.backupCreated ? ' A safety backup was created first.' : ''}
            </span>
          </div>
        )}

        <Button onClick={() => setConfirmOpen(true)} disabled={!preview || applying} className="gap-2">
          {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
          Compact Now
        </Button>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="w-5 h-5" />
              Compact Save Data
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes stale chunk data older than {staleDays} day{staleDays === 1 ? '' : 's'}
              {preview ? ` (${preview.staleSizeFormatted} across ${preview.staleChunkCount} chunks)` : ''}.
              A safety backup will be created first, but this action cannot be undone otherwise.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApply} className="bg-warning text-warning-foreground hover:bg-warning/90">
              Compact save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
