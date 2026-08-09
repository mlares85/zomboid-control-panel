import { useState } from 'react'
import { ChevronDown, Loader2, Trash2, Wifi } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
import { backupApi, BackupDestination } from '@/lib/api'
import { cn } from '@/lib/utils'
import { DESTINATION_TYPE_LABELS } from './formatUtils'
import { GoogleDriveSetup } from './GoogleDriveSetup'

interface BackupDestinationCardProps {
  destination: BackupDestination
  onUpdated: () => void
  onDeleted: () => void
}

export function BackupDestinationCard({ destination, onUpdated, onDeleted }: BackupDestinationCardProps) {
  const { toast } = useToast()
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null)
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handleToggle = async (enabled: boolean) => {
    setToggling(true)
    try {
      const result = await backupApi.updateDestination(destination.id, { enabled })
      if (result.success) {
        onUpdated()
      } else {
        toast({ title: 'Could Not Update Destination', description: result.message || 'Failed to update destination', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Could Not Update Destination', description: error instanceof Error ? error.message : 'Failed to update destination', variant: 'destructive' })
    } finally {
      setToggling(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await backupApi.testDestination(destination.id)
      setTestResult(result)
    } catch (error) {
      setTestResult({ success: false, message: error instanceof Error ? error.message : 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  const handleDelete = async () => {
    setDeleteOpen(false)
    setDeleting(true)
    try {
      const result = await backupApi.deleteDestination(destination.id)
      if (result.success) {
        toast({ title: 'Destination Removed', description: `${destination.name} was removed.`, variant: 'success' as const })
        onDeleted()
      } else {
        toast({ title: 'Could Not Remove Destination', description: result.message || 'Failed to delete destination', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Could Not Remove Destination', description: error instanceof Error ? error.message : 'Failed to delete destination', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  const isGoogleDrive = destination.type === 'google-drive'

  return (
    <Card className={cn('border-border/50', !destination.enabled && 'opacity-70')}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm text-foreground truncate">{destination.name}</p>
              <Badge variant="outline">{DESTINATION_TYPE_LABELS[destination.type]}</Badge>
              {!destination.implemented && <Badge variant="secondary">Not yet implemented</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-1 break-all">{destination.path}</p>
          </div>
          <Switch
            checked={destination.enabled}
            onCheckedChange={handleToggle}
            disabled={toggling}
            aria-label={`Toggle ${destination.name}`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing || !destination.implemented}
            className="h-9 gap-2"
            title={!destination.implemented ? 'Not yet implemented' : 'Test connection'}
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
            Test
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            disabled={deleting}
            className="h-9 gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </Button>
        </div>

        {testResult && (
          <p className={cn('text-xs', testResult.success ? 'text-[hsl(var(--success))]' : 'text-destructive')}>
            {testResult.message}
            {testResult.latencyMs != null && ` (${testResult.latencyMs} ms)`}
          </p>
        )}

        {isGoogleDrive && (
          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs text-muted-foreground">
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', expanded && 'rotate-180')} />
                {expanded ? 'Hide' : 'Show'} connection settings
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pt-2">
                <GoogleDriveSetup destination={destination} onUpdated={onUpdated} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Destination
            </AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{destination.name}</strong>? Backups already copied there are not removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
