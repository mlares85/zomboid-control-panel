import { useCallback, useEffect, useState } from 'react'
import { Container, Loader2, Play, RefreshCw, Square, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { reportClientWarning } from '@/lib/client-errors'
import { dockerApi, type DockerContainerSummary } from '@/lib/api'

interface DockerContainerStatusProps {
  /** Container id or name as stored on the server profile. */
  containerRef: string
  /** Poll interval for status refresh, in ms. */
  pollIntervalMs?: number
}

const STATE_BADGE: Record<string, { variant: BadgeProps['variant']; label: string }> = {
  running: { variant: 'success', label: 'Running' },
  restarting: { variant: 'warning', label: 'Restarting' },
  paused: { variant: 'warning', label: 'Paused' },
  exited: { variant: 'outline', label: 'Stopped' },
  created: { variant: 'outline', label: 'Created' },
  dead: { variant: 'destructive', label: 'Dead' },
}

function findContainer(containers: DockerContainerSummary[], containerRef: string) {
  return containers.find((c) => c.id === containerRef || c.name === containerRef || c.id.startsWith(containerRef))
}

// Shows a Docker container's live status with start/stop/restart controls and
// an expandable log tail. Renders nothing when the Docker socket isn't
// mounted/available — the panel falls back to native process controls then.
export function DockerContainerStatus({ containerRef, pollIntervalMs = 8000 }: DockerContainerStatusProps) {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [container, setContainer] = useState<DockerContainerSummary | null>(null)
  const [pending, setPending] = useState<'start' | 'stop' | 'restart' | null>(null)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logLines, setLogLines] = useState<string[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const { toast } = useToast()

  const refresh = useCallback(async () => {
    try {
      const data = await dockerApi.getStatus()
      setAvailable(data.available)
      setContainer(data.available ? findContainer(data.containers, containerRef) ?? null : null)
    } catch (error) {
      reportClientWarning('Failed to fetch Docker status.', error)
    }
  }, [containerRef])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, pollIntervalMs)
    return () => clearInterval(interval)
  }, [refresh, pollIntervalMs])

  const runAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!container) return
    setPending(action)
    try {
      const result = await dockerApi[action](container.id)
      if (!result.success) throw new Error(result.error || `Failed to ${action} container`)
      toast({ title: `Container ${action === 'stop' ? 'stopping' : action === 'start' ? 'starting' : 'restarting'}`, description: container.name })
      await refresh()
    } catch (error) {
      toast({ title: `Failed to ${action} container`, description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setPending(null)
    }
  }

  const toggleLogs = async () => {
    if (logsOpen) {
      setLogsOpen(false)
      return
    }
    setLogsOpen(true)
    if (!container) return
    setLogsLoading(true)
    try {
      const result = await dockerApi.getLogs(container.id, 10)
      setLogLines(result.success ? result.lines : [result.error || 'Failed to load logs'])
    } catch (error) {
      setLogLines([error instanceof Error ? error.message : 'Failed to load logs'])
    } finally {
      setLogsLoading(false)
    }
  }

  if (available === null || !available) return null

  const badge = container ? STATE_BADGE[container.state] ?? { variant: 'outline' as const, label: container.state } : null
  const isRunning = container?.state === 'running'

  return (
    <div className="space-y-2 rounded-md border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Container className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium text-foreground truncate">{container?.name || containerRef}</span>
          {badge && <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>}
        </div>
        {!container && <span className="text-xs text-muted-foreground">Container not found</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        {isRunning ? (
          <Button size="sm" variant="outline" disabled={!container || pending !== null} onClick={() => runAction('stop')}>
            {pending === 'stop' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Square className="w-4 h-4 mr-1.5" />} Stop
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={!container || pending !== null} onClick={() => runAction('start')}>
            {pending === 'start' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Play className="w-4 h-4 mr-1.5" />} Start
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={!container || pending !== null} onClick={() => runAction('restart')}>
          {pending === 'restart' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />} Restart
        </Button>
        <Button size="sm" variant="ghost" disabled={!container} onClick={toggleLogs}>
          <Terminal className="w-4 h-4 mr-1.5" /> {logsOpen ? 'Hide Logs' : 'Show Logs'}
        </Button>
      </div>

      {logsOpen && (
        <pre className="max-h-40 overflow-y-auto rounded-md bg-background/60 border border-border/40 p-2 text-[11px] font-mono text-foreground/80 whitespace-pre-wrap">
          {logsLoading ? 'Loading logs…' : logLines.length > 0 ? logLines.join('\n') : 'No log output'}
        </pre>
      )}
    </div>
  )
}
