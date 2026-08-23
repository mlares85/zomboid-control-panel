import { useCallback, useContext, useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronDown, ChevronRight, Terminal, Trash2, ArrowDownToLine } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { SocketContext } from '@/contexts/SocketContext'
import { dockerApi } from '@/lib/api'
import { reportClientWarning } from '@/lib/client-errors'

const MAX_LINES = 500
const INITIAL_TAIL = 200
// Consider the user "at the bottom" within this many px so small layout
// jitter doesn't wrongly pause auto-scroll.
const BOTTOM_THRESHOLD_PX = 24

interface LogLine {
  id: number
  text: string
  stream: 'stdout' | 'stderr'
}

interface ContainerLogsProps {
  containerId: string
  containerName?: string
}

function appendLine(lines: LogLine[], text: string, stream: 'stdout' | 'stderr', nextId: number): LogLine[] {
  const next = [...lines, { id: nextId, text, stream }]
  return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next
}

function useContainerLogLines(containerId: string, expanded: boolean) {
  const [lines, setLines] = useState<LogLine[]>([])
  const socket = useContext(SocketContext)
  const nextIdRef = useRef(0)

  const clear = useCallback(() => setLines([]), [])

  // Initial tail — fetched once per container, whether or not the card is expanded,
  // so the collapsed line-count badge is accurate right away.
  useEffect(() => {
    let cancelled = false
    setLines([])
    nextIdRef.current = 0
    dockerApi.getLogs(containerId, INITIAL_TAIL)
      .then(res => {
        if (cancelled || !res.success) return
        setLines(res.lines.map(text => ({ id: nextIdRef.current++, text, stream: 'stdout' as const })))
      })
      .catch(error => reportClientWarning('Failed to fetch container logs.', error))
    return () => { cancelled = true }
  }, [containerId])

  useEffect(() => {
    if (!socket || !expanded) return
    socket.emit('subscribe:container-logs', { containerId })
    const onLog = (data: { line: string; stream: 'stdout' | 'stderr' }) => {
      setLines(prev => appendLine(prev, data.line, data.stream, nextIdRef.current++))
    }
    socket.on('container:log', onLog)
    return () => {
      socket.off('container:log', onLog)
      socket.emit('unsubscribe:container-logs', { containerId })
    }
  }, [socket, containerId, expanded])

  return { lines, clear }
}

function useAutoScroll(lines: LogLine[]) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [lines, autoScroll])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX
    setAutoScroll(atBottom)
  }, [])

  const resume = useCallback(() => {
    setAutoScroll(true)
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [])

  return { scrollRef, autoScroll, handleScroll, resume }
}

function LogBody({ lines, scrollRef, onScroll }: {
  lines: LogLine[]
  scrollRef: RefObject<HTMLDivElement>
  onScroll: () => void
}) {
  if (lines.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center font-mono text-xs text-muted-foreground">
        No logs yet
      </div>
    )
  }
  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="max-h-80 overflow-y-auto rounded-md bg-zinc-950 p-2 font-mono text-xs leading-relaxed"
    >
      {lines.map(line => (
        <div key={line.id} className={cn('whitespace-pre-wrap break-all', line.stream === 'stderr' ? 'text-red-400' : 'text-zinc-300')}>
          {line.text}
        </div>
      ))}
    </div>
  )
}

export function ContainerLogs({ containerId, containerName }: ContainerLogsProps) {
  const [expanded, setExpanded] = useState(false)
  const { lines, clear } = useContainerLogLines(containerId, expanded)
  const { scrollRef, autoScroll, handleScroll, resume } = useAutoScroll(lines)

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 rounded-sm"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <CardTitle className="truncate text-sm">{containerName || 'Container logs'}</CardTitle>
          {!expanded && lines.length > 0 && (
            <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[9px] tabular-nums">{lines.length}</Badge>
          )}
        </button>
        {expanded && (
          <div className="flex shrink-0 items-center gap-1">
            {!autoScroll && (
              <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={resume}>
                <ArrowDownToLine className="h-3 w-3" /> Resume
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-muted-foreground" onClick={clear} aria-label="Clear logs">
              <Trash2 className="h-3 w-3" /> Clear
            </Button>
          </div>
        )}
      </CardHeader>
      {expanded && (
        <CardContent className="p-3 pt-0">
          <LogBody lines={lines} scrollRef={scrollRef} onScroll={handleScroll} />
        </CardContent>
      )}
    </Card>
  )
}
