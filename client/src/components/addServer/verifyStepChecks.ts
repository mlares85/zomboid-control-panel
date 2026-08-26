import { dockerApi, panelBridgeApi, serverApi, rconApi, type ServerInstance } from '@/lib/api'

export type CheckStatus = 'pending' | 'running' | 'ok' | 'fail' | 'waiting'

export interface CheckItem {
  id: string
  label: string
  status: CheckStatus
  detail?: string
  fixUrl?: string
}

export const RCON_MAX_ATTEMPTS = 12
export const RCON_RETRY_INTERVAL_MS = 5000
export const BOOT_POLL_INTERVAL_MS = 3000
export const BOOT_MAX_POLLS = 40 // ~2 minutes

// Boot progress markers — panel entrypoint prefixes with [panel], then PZ logs its own startup
export const BOOT_STAGES: Array<{ pattern: RegExp; label: string; done?: boolean }> = [
  { pattern: /\[panel\] Installing 32-bit/i, label: 'Installing 32-bit compatibility libraries…' },
  { pattern: /\[panel\] 32-bit libraries installed/i, label: '32-bit libraries installed' },
  { pattern: /\[panel\] Extracting SQLite/i, label: 'Extracting SQLite native library…' },
  { pattern: /\[panel\] Pre-seeding RCON/i, label: 'Seeding RCON config…' },
  { pattern: /pzexe.*mainClass/i, label: 'PZ server process starting…' },
  { pattern: /SERVER STARTED/i, label: 'PZ server started, waiting for RCON…' },
  { pattern: /RCON.*listening/i, label: 'RCON is listening', done: true },
]

export async function checkFiles(server: ServerInstance): Promise<Partial<CheckItem>> {
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

/** Start the PZ server process via the panel's /start endpoint. */
export async function startPzServer(): Promise<Partial<CheckItem>> {
  try {
    // Check if already running first
    const status = await serverApi.getStatus()
    if (status?.isRunning) {
      return { status: 'ok', detail: 'Server is already running' }
    }

    await serverApi.start()
    // Give the process a moment to spawn before RCON polling starts
    await new Promise<void>((r) => setTimeout(r, 3000))
    return { status: 'ok', detail: 'Server process started — waiting for RCON' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not start server'
    return { status: 'fail', detail: msg }
  }
}

export async function checkRcon(server: ServerInstance): Promise<Partial<CheckItem>> {
  try {
    // Don't pass credentials — the RCON service already has the config
    // from activateServer(). The server record's password is masked by
    // sanitizeServerResponse, so passing it would send "••••••••".
    await rconApi.connect()
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

/** Reads bridge status without attempting to install/configure anything. */
export async function checkBridgeStatus(): Promise<Partial<CheckItem>> {
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

/** native / docker-local: bridge reaches the server's filesystem directly, so auto-configure finds it. */
export async function checkBridgeNative(serverId: string | number): Promise<Partial<CheckItem>> {
  try { await panelBridgeApi.autoConfigure(serverId) } catch { /* fall through to status read below */ }
  return checkBridgeStatus()
}

/** docker-managed: install the mod into the running container, then read status. */
export async function checkBridgeDocker(serverId: string | number): Promise<Partial<CheckItem>> {
  try {
    await panelBridgeApi.installDocker(serverId)
  } catch (err) {
    return { status: 'fail', detail: err instanceof Error ? err.message : 'Could not install PanelBridge into the container', fixUrl: '/settings' }
  }
  return checkBridgeStatus()
}

/** Poll container logs for boot progress markers. Resolves when RCON is listening or times out. */
export async function waitForContainerBoot(
  containerId: string,
  onProgress: (detail: string) => void,
  cancelled: { current: boolean },
): Promise<boolean> {
  for (let i = 0; i < BOOT_MAX_POLLS; i++) {
    if (cancelled.current) return false
    try {
      const result = await dockerApi.getLogs(containerId, 100)
      if (result.success) {
        const text = result.lines.join('\n')
        let latestStage = ''
        let bootDone = false
        for (const stage of BOOT_STAGES) {
          if (stage.pattern.test(text)) {
            latestStage = stage.label
            if (stage.done) bootDone = true
          }
        }
        if (latestStage) onProgress(latestStage)
        if (bootDone) return true
      }
    } catch { /* keep polling */ }
    await new Promise<void>((r) => setTimeout(r, BOOT_POLL_INTERVAL_MS))
  }
  return false
}

export function updateCheck(checks: CheckItem[], id: string, patch: Partial<CheckItem>): CheckItem[] {
  return checks.map((c) => (c.id === id ? { ...c, ...patch } : c))
}

export function buildInitialChecks(isDocker: boolean, isRemote: boolean): CheckItem[] {
  const checks: CheckItem[] = [
    { id: 'files', label: 'Server files accessible', status: 'pending' },
  ]
  if (isDocker) {
    checks.push({ id: 'boot', label: 'Container starting', status: 'pending' })
  } else if (!isRemote) {
    checks.push({ id: 'start', label: 'Starting server', status: 'pending' })
  }
  checks.push(
    { id: 'rcon', label: 'RCON reachable', status: 'pending' },
    { id: 'bridge', label: 'PanelBridge installed', status: 'pending' },
  )
  return checks
}
