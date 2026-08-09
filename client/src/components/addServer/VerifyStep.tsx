import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { serverApi, serversApi, rconApi, panelBridgeApi, type ServerInstance } from '@/lib/api'

interface VerifyStepProps {
  serverId: string | number
  onVerified: () => void
}

type CheckStatus = 'pending' | 'running' | 'ok' | 'fail'

interface CheckItem {
  id: string
  label: string
  status: CheckStatus
  detail?: string
  fixUrl?: string
}

const INITIAL_CHECKS: CheckItem[] = [
  { id: 'files', label: 'Server files accessible', status: 'pending' },
  { id: 'rcon', label: 'RCON reachable', status: 'pending' },
  { id: 'bridge', label: 'PanelBridge installed', status: 'pending' },
]

async function checkFiles(server: ServerInstance): Promise<Partial<CheckItem>> {
  if (server.isRemote) return { status: 'ok', detail: 'Remote server — no local files to check' }
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
  try {
    await panelBridgeApi.autoConfigure(serverId)
  } catch {
    // auto-configure may legitimately fail before the mod has ever run — status check below decides pass/fail
  }
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

/** THE MISSING STEP — live probes with a distinct cause and fix link per failure. */
export function VerifyStep({ serverId, onVerified }: VerifyStepProps) {
  const [checks, setChecks] = useState<CheckItem[]>(INITIAL_CHECKS)
  const [running, setRunning] = useState(false)

  const runAll = useCallback(async () => {
    setRunning(true)
    setChecks(INITIAL_CHECKS.map((c) => ({ ...c, status: 'running' })))
    let server: ServerInstance
    try {
      server = (await serversApi.get(serverId)).server
    } catch {
      setChecks(INITIAL_CHECKS.map((c) => ({ ...c, status: 'fail', detail: 'Could not load server record' })))
      setRunning(false)
      return
    }

    const results = await Promise.all([checkFiles(server), checkRcon(server), checkBridge(serverId)])
    setChecks(INITIAL_CHECKS.map((c, i) => ({ ...c, ...results[i] } as CheckItem)))
    setRunning(false)
  }, [serverId])

  useEffect(() => {
    runAll()
  }, [runAll])

  const allOk = checks.every((c) => c.status === 'ok')
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
            {check.status === 'running' && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
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
