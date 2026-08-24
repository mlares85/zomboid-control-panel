import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { serversApi, type ServerInstance } from '@/lib/api'
import { BridgeSftpInstallForm } from './BridgeSftpInstallForm'
import {
  RCON_MAX_ATTEMPTS,
  RCON_RETRY_INTERVAL_MS,
  buildInitialChecks,
  checkBridgeDocker,
  checkBridgeNative,
  checkBridgeStatus,
  checkFiles,
  checkRcon,
  updateCheck,
  waitForContainerBoot,
  type CheckItem,
} from './verifyStepChecks'

interface VerifyStepProps {
  serverId: string | number
  onVerified: () => void
}

export function VerifyStep({ serverId, onVerified }: VerifyStepProps) {
  const [checks, setChecks] = useState<CheckItem[]>([])
  const [running, setRunning] = useState(false)
  const [provider, setProvider] = useState<string | undefined>(undefined)
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

    setProvider(server.provider)
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

    // Bridge check — behavior depends on how the server files are reached
    if (cancelledRef.current) return
    if (server.provider === 'remote-sftp') {
      // Don't auto-install over SFTP — wait for the user to supply credentials.
      setChecks((prev) => updateCheck(prev, 'bridge', {
        status: 'waiting',
        detail: 'Enter SFTP credentials below to install the PanelBridge mod',
      }))
    } else {
      setChecks((prev) => updateCheck(prev, 'bridge', { status: 'running', detail: isDocker ? 'Installing PanelBridge mod into container…' : undefined }))
      const bridgeResult = isDocker ? await checkBridgeDocker(serverId) : await checkBridgeNative(serverId)
      if (cancelledRef.current) return
      setChecks((prev) => updateCheck(prev, 'bridge', bridgeResult))
    }

    setRunning(false)
  }, [serverId])

  const handleSftpInstalled = useCallback(async (result: { success: boolean; message?: string }) => {
    if (!result.success) {
      setChecks((prev) => updateCheck(prev, 'bridge', { status: 'fail', detail: result.message || 'SFTP install failed' }))
      return
    }
    setChecks((prev) => updateCheck(prev, 'bridge', { status: 'running', detail: 'Verifying mod connection…' }))
    const statusResult = await checkBridgeStatus()
    setChecks((prev) => updateCheck(prev, 'bridge', statusResult))
  }, [])

  useEffect(() => {
    runAll()
    return () => {
      cancelledRef.current = true
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [runAll])

  const allOk = checks.length > 0 && checks.every((c) => c.status === 'ok')
  const anyFailed = checks.some((c) => c.status === 'fail')
  const bridgeCheck = checks.find((c) => c.id === 'bridge')
  const showSftpForm = provider === 'remote-sftp' && bridgeCheck && bridgeCheck.status !== 'ok'

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Verifying the connection</h2>
        <p className="mt-1 text-sm text-muted-foreground">Nothing here is a dead end — every failure has a fix.</p>
      </div>

      <ul className="space-y-2">
        {checks.map((check) => (
          <li key={check.id} className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5">
            <div className="flex items-start gap-3">
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
            </div>
            {check.id === 'bridge' && showSftpForm && (
              <BridgeSftpInstallForm serverId={serverId} onInstalled={handleSftpInstalled} />
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
