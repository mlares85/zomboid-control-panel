import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { dockerApi, serverApi, serversApi, rconApi, panelBridgeApi, type ServerInstance } from '@/lib/api'

interface VerifyStepProps {
  serverId: string | number
  onVerified: () => void
}

type CheckStatus = 'pending' | 'running' | 'ok' | 'fail' | 'waiting'

interface CheckItem {
  id: string
  label: string
  status: CheckStatus
  detail?: string
  fixUrl?: string
}

const RCON_MAX_ATTEMPTS = 12
const RCON_RETRY_INTERVAL_MS = 5000
const BOOT_POLL_INTERVAL_MS = 3000
const BOOT_MAX_POLLS = 40 // ~2 minutes

// Entrypoint log markers from dockerContainerFactory.js PZ_ENTRYPOINT
const BOOT_STAGES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /Installing 32-bit/i, label: 'Installing 32-bit compatibility libraries…' },
  { pattern: /32-bit libraries installed/i, label: '32-bit libraries installed' },
  { pattern: /Extracting SQLite/i, label: 'Extracting SQLite native library…' },
  { pattern: /SQLite native lib extracted/i, label: 'SQLite library ready' },
  { pattern: /Pre-creating RCON config/i, label: 'Configuring RCON…' },
  { pattern: /start-server\.sh/i, label: 'Launching PZ server…' },
]

async function checkFiles(server: ServerInstance): Promise<Partial<CheckItem>> {
  if (server.isRemote) return { status: 'ok', detail: 'Remote server — no local files to check' }
  if (server.provider === 'docker-managed') return { status: 'ok', detail: 'Managed container — files inside container' }
  try {
    const status = await serverApi.getStatus()
    if (status?.configured) return { status: 'ok', detail: status.serverPath }
    return { status: 'fail', detail: 'Server path is not configured', fixUrl: '/servers' }
  } catch (err) {
    return { status: 'fail', detail: err instanceof Error ? err.message : 'Could not read server status', fixUrl: '/servers' }
  }
}

async function checkRcon(server: ServerInstance): Promise<Partial<CheckItem>> {
  try {
    await rconApi.connect(server.rconHost, server.rconPort, server.rconPassword)
    return { status: 'ok', detail: `${server.rconHost}:${server.rconPort}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Connection failed'
    const authFailed = /authentication|password/i.test(msg)
    return {
      status: 'fail',
      detail: authFailed ? 'RCON password rejected' : msg,
      fixUrl: '/servers',
    }
  }
}

async function checkBridge(serverId: string | number): Promise<Partial<CheckItem>> {
  try { await panelBridgeApi.autoConfigure(serverId) } catch { /* OK */ }
  try {
    const status = await panelBridgeApi.getStatus()
    if (status.isRunning || status.modStatus?.alive) {
      return { status: 'ok', detail: status.modStatus?.alive ? 'Mod connected' : 'Bridge running, waiting for mod' }
    }
    return { status: 'fail', detail: 'Not installed yet — install the PanelBridge mod on the server', fixUrl: '/settings' }
  } catch (err) {
    return { status: 'fail', detail: err instanceof Error ? err.message : 'Could not read bridge status', fixUrl: '/settings' }
  }
}

/** Poll container logs for boot progress markers. Resolves when PZ start-server.sh is reached or times out. */
async function waitForContainerBoot(
  containerId: string,
  onProgress: (detail: string) => void,
  cancelled: { current: boolean },
): Promise<boolean> {
  for (let i = 0; i < BOOT_MAX_POLLS; i++) {
    if (cancelled.current) return false
    try {
      const result = await dockerApi.getLogs(containerId, 50)
      if (result.success) {
        const text = result.lines.join('\n')
        let latestStage = ''
        for (const stage of BOOT_STAGES) {
          if (stage.pattern.test(text)) latestStage = stage.label
        }
        if (latestStage) onProgress(latestStage)
        if (/start-server\.sh/i.test(text)) return true
      }
    } catch { /* keep polling */ }
    await new Promise<void>((r) => setTimeout(r, BOOT_POLL_INTERVAL_MS))
  }
  return false
}

function updateCheck(checks: CheckItem[], id: string, patch: Partial<CheckItem>): CheckItem[] {
  return checks.map((c) => (c.id === id ? { ...c, ...patch } : c))
}

function buildInitialChecks(isDocker: boolean): CheckItem[] {
  const checks: CheckItem[] = [
    { id: 'files', label: 'Server files accessible', status: 'pending' },
  ]
  if (isDocker) {
    checks.push({ id: 'boot', label: 'Container starting', status: 'pending' })
  }
  checks.push(
    { id: 'rcon', label: 'RCON reachable', status: 'pending' },
    { id: 'bridge', label: 'PanelBridge installed', status: 'pending' },
  )
  return checks
}

export function VerifyStep({ serverId, onVerified }: VerifyStepProps) {
  const [checks, setChecks] = useState<CheckItem[]>([])
  const [running, setRunning] = useState(false)
  const cancelledRef = useRef(false)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runAll = useCallback(async () => {
    cancelledRef.current = false
    setRunning(true)

    let server: ServerInstance
    try {
      server = (await serversApi.get(serverId)).server
    } catch {
      setChecks([{ id: 'error', label: 'Server record', status: 'fail', detail: 'Could not load server record' }])
      setRunning(false)
      return
    }

    const isDocker = server.provider === 'docker-managed'
    const initial = buildInitialChecks(isDocker)
    setChecks(initial.map((c) => ({ ...c, status: 'running' })))

    // Files check
    const filesResult = await checkFiles(server)
    if (cancelledRef.current) return
    setChecks((prev) => updateCheck(prev, 'files', filesResult))

    // Docker boot check — wait for the container entrypoint to finish
    if (isDocker && server.dockerContainerId) {
      setChecks((prev) => updateCheck(prev, 'boot', { status: 'waiting', detail: 'Waiting for container to start…' }))
      const booted = await waitForContainerBoot(
        server.dockerContainerId,
        (detail) => setChecks((prev) => updateCheck(prev, 'boot', { status: 'waiting', detail })),
        cancelledRef,
      )
      if (cancelledRef.current) return
      setChecks((prev) => updateCheck(prev, 'boot', booted
        ? { status: 'ok', detail: 'PZ server process launched' }
        : { status: 'ok', detail: 'Container running (boot check timed out — continuing)' },
      ))
    }

    // RCON check — retry with backoff
    let rconResult: Partial<CheckItem> = { status: 'fail' }
    for (let attempt = 1; attempt <= RCON_MAX_ATTEMPTS; attempt++) {
      if (cancelledRef.current) return
      const label = attempt === 1 ? 'RCON reachable' : `RCON reachable (attempt ${attempt}/${RCON_MAX_ATTEMPTS})`
      setChecks((prev) => updateCheck(prev, 'rcon', {
        status: 'waiting', label,
        detail: attempt === 1 ? 'Connecting…' : 'Waiting for RCON to become available…',
      }))

      rconResult = await checkRcon(server)
      if (cancelledRef.current) return

      if (rconResult.status === 'ok') {
        setChecks((prev) => updateCheck(prev, 'rcon', { ...rconResult, label: 'RCON reachable' }))
        break
      }
      if (rconResult.detail && /password rejected/i.test(rconResult.detail)) {
        setChecks((prev) => updateCheck(prev, 'rcon', { ...rconResult, label: 'RCON reachable' }))
        break
      }
      if (attempt < RCON_MAX_ATTEMPTS) {
        await new Promise<void>((resolve) => {
          retryTimerRef.current = setTimeout(resolve, RCON_RETRY_INTERVAL_MS)
        })
      } else {
        setChecks((prev) => updateCheck(prev, 'rcon', {
          ...rconResult, label: 'RCON reachable',
          detail: `Server did not respond after ${RCON_MAX_ATTEMPTS} attempts — it may still be starting. Try Retry.`,
        }))
      }
    }

    // Bridge check
    if (cancelledRef.current) return
    setChecks((prev) => updateCheck(prev, 'bridge', { status: 'running' }))
    const bridgeResult = await checkBridge(serverId)
    if (cancelledRef.current) return
    setChecks((prev) => updateCheck(prev, 'bridge', bridgeResult))

    setRunning(false)
  }, [serverId])

  useEffect(() => {
    runAll()
    return () => {
      cancelledRef.current = true
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [runAll])

  const allOk = checks.length > 0 && checks.every((c) => c.status === 'ok')
  const anyFailed = checks.some((c) => c.status === 'fail')

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Verifying the connection</h2>
        <p className="mt-1 text-sm text-muted-foreground">Nothing here is a dead end — every failure has a fix.</p>
      </div>

      <ul className="space-y-2">
        {checks.map((check) => (
          <li key={check.id} className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5">
            {(check.status === 'running' || check.status === 'waiting') && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
            {check.status === 'ok' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
            {check.status === 'fail' && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
            {check.status === 'pending' && <div className="mt-1 h-3 w-3 shrink-0 rounded-full border border-muted-foreground/40" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{check.label}</p>
              {check.detail && (
                <p className={`mt-0.5 text-xs ${check.status === 'fail' ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {check.detail}
                </p>
              )}
            </div>
            {check.status === 'fail' && check.fixUrl && (
              <Link to={check.fixUrl} className="shrink-0 text-xs font-medium text-primary hover:underline">
                Fix this
              </Link>
            )}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Button variant="outline" onClick={runAll} disabled={running} className="flex-1">
          {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking…</> : <><RefreshCw className="mr-2 h-4 w-4" /> Retry</>}
        </Button>
        <Button onClick={onVerified} disabled={!allOk || running} className="flex-1 onboarding-cta">
          Continue <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      {anyFailed && !running && (
        <p className="text-center text-xs text-muted-foreground">
          You can continue once every check passes, or use "Fix this" to resolve an item first.
        </p>
      )}
    </div>
  )
}
