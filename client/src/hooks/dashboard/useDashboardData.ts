import { useEffect, useState, useCallback, useRef } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { useSocket } from '@/contexts/SocketContext'
import { usePageShortcut } from '@/hooks/useKeyboardShortcuts'
import {
  serverApi, rconApi, playersApi, panelBridgeApi, backupApi, configApi, serversApi, debugApi,
  panelUpdateApi, modsApi, schedulerApi,
  type ServerInstance, type PanelUpdateStatus, type DiscoveredMount,
} from '@/lib/api'
import { errorToastContent } from '@/lib/errorToast'
import { getDashboardSuccessCopy, isFailedActionResult, formatAge, formatEta } from '@/components/dashboard/helpers'
import type {
  ServerStatus, Player, BridgeStatus, PlayerActivity, PerformancePoint,
  DashboardView, MaintenanceState, PlayerPresence,
} from '@/components/dashboard/types'
import type { Verdict, WorkItem } from '@/components/dashboard/DashboardVerdict'
import { Activity, Archive, CalendarClock, Gamepad2, ScrollText, Server, Wifi } from 'lucide-react'

const DASHBOARD_ONBOARDING_DISMISSED_KEY = 'pz-dashboard-onboarding-dismissed-v1'
const DASHBOARD_VIEW_KEY = 'pz-dashboard-view-v1'

export function useDashboardData() {
  /* ── state ────────────────────────────────────────────────────────── */
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null)
  const [playerActivity, setPlayerActivity] = useState<PlayerActivity[]>([])
  const [performanceHistory, setPerformanceHistory] = useState<PerformancePoint[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [, setTick] = useState(0)
  const [autoStartServer, setAutoStartServer] = useState(false)
  const [panelInfo, setPanelInfo] = useState<{ localIp: string; port: number; url: string } | null>(null)
  const [activeServer, setActiveServer] = useState<ServerInstance | null>(null)
  const [showPerformanceCharts, setShowPerformanceCharts] = useState(false)
  const [serverCount, setServerCount] = useState<number | null>(null)
  const [view, setView] = useState<DashboardView>(() => {
    try { const s = localStorage.getItem(DASHBOARD_VIEW_KEY); if (s === 'cards' || s === 'classic') return s } catch {}
    return 'classic'
  })
  const [showQuickStart, setShowQuickStart] = useState(() => {
    try { return localStorage.getItem(DASHBOARD_ONBOARDING_DISMISSED_KEY) !== 'true' } catch { return true }
  })
  const [panelUpdate, setPanelUpdate] = useState<PanelUpdateStatus | null>(null)
  const [panelUpdateDismissedVersion, setPanelUpdateDismissedVersion] = useState<string | null>(() => {
    try { return sessionStorage.getItem('panel-update-banner-dismissed') } catch { return null }
  })
  const [maintenance, setMaintenance] = useState<MaintenanceState>({
    lastBackup: null, backupCount: 0, modUpdatesAvailable: 0, modsTracked: 0,
    scheduledTasksCount: 0, nextRun: null, errorCount: null, schedulerLoaded: false,
  })
  const [autoDiscoveryMount, setAutoDiscoveryMount] = useState<DiscoveredMount | null>(null)

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const initialLoadingRef = useRef(true)
  const { toast } = useToast()
  const socket = useSocket()

  /* ── fetchers ─────────────────────────────────────────────────────── */
  const fetchStatus = useCallback(async () => {
    try { const d = await serverApi.getStatus(); setStatus(d); setFetchError(null); setLastUpdated(new Date()) }
    catch { setFetchError('Failed to connect to server.') }
  }, [])
  const fetchPlayers = useCallback(async () => {
    try { const d = await playersApi.getPlayers(); if (d.players) setPlayers(d.players) } catch { setPlayers([]) }
  }, [])
  const fetchBridgeStatus = useCallback(async () => {
    try { setBridgeStatus(await panelBridgeApi.getStatus()) } catch { setBridgeStatus(null) }
  }, [])
  const fetchPlayerActivity = useCallback(async () => {
    try { const d = await playersApi.getActivityLogs(undefined, 15); if (d.logs) setPlayerActivity(d.logs.slice(0, 12)) }
    catch { setPlayerActivity([]) }
  }, [])
  const fetchPerformanceHistory = useCallback(async () => {
    try {
      const data = await debugApi.getPerformanceHistory(60)
      if (data.history) {
        setPerformanceHistory(data.history.map((h: Record<string, unknown>) => ({
          time: new Date(h.timestamp as string).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          timestamp: h.timestamp as string,
          playerCount: (h.playerCount as number) || 0,
          memoryMB: Math.round(((h.memoryUsed as number) || 0) / (1024 * 1024)),
          pzMemMB: h.pzMemUsed ? Math.round((h.pzMemUsed as number) / (1024 * 1024)) : undefined,
          cpuPercent: h.cpuUsage != null ? Math.round(h.cpuUsage as number) : undefined,
          hostMemUsedGB: h.hostMemUsed ? +((h.hostMemUsed as number) / (1024 * 1024 * 1024)).toFixed(1) : undefined,
          hostMemTotalGB: h.hostMemTotal ? +((h.hostMemTotal as number) / (1024 * 1024 * 1024)).toFixed(1) : undefined,
          hostDiskUsedGB: h.hostDiskUsed ? +((h.hostDiskUsed as number) / (1024 * 1024 * 1024)).toFixed(1) : undefined,
          hostDiskTotalGB: h.hostDiskTotal ? +((h.hostDiskTotal as number) / (1024 * 1024 * 1024)).toFixed(1) : undefined,
        })))
      }
    } catch { /* Ignore missing telemetry history */ }
  }, [])
  const fetchAutoStartSetting = useCallback(async () => {
    try {
      const r = await configApi.getAppSettings()
      if (r?.settings?.autoStartServer !== undefined) {
        setAutoStartServer(r.settings.autoStartServer === true || r.settings.autoStartServer === 'true')
      }
    } catch { /* keep fallback */ }
  }, [])
  const fetchActiveServer = useCallback(async () => {
    try { const d = await serversApi.getResolvedActive(); setActiveServer(d.server ?? null) } catch { setActiveServer(null) }
  }, [])
  const fetchMaintenance = useCallback(async () => {
    const [backupRes, modsRes, tasksRes, schedRes, errorRes] = await Promise.allSettled([
      backupApi.getStatus(),
      modsApi.getStatus(),
      schedulerApi.getTasks() as Promise<{ tasks: Array<{ enabled?: number | boolean }> }>,
      schedulerApi.getStatus() as Promise<{ nextRun?: { label: string; at: string } | null }>,
      serverApi.getConsoleErrorCount(),
    ])
    setMaintenance(prev => ({
      lastBackup: backupRes.status === 'fulfilled' ? backupRes.value.lastBackup : prev.lastBackup,
      backupCount: backupRes.status === 'fulfilled' ? (backupRes.value.backupCount ?? 0) : prev.backupCount,
      modUpdatesAvailable: modsRes.status === 'fulfilled' ? ((modsRes.value as { updatesAvailable?: number }).updatesAvailable ?? 0) : prev.modUpdatesAvailable,
      modsTracked: modsRes.status === 'fulfilled' ? ((modsRes.value as { totalModsTracked?: number }).totalModsTracked ?? 0) : prev.modsTracked,
      scheduledTasksCount: tasksRes.status === 'fulfilled'
        ? (tasksRes.value.tasks ?? []).filter(t => t.enabled === 1 || t.enabled === true).length
        : prev.scheduledTasksCount,
      nextRun: schedRes.status === 'fulfilled' ? (schedRes.value.nextRun ?? null) : prev.nextRun,
      errorCount: errorRes.status === 'fulfilled' && errorRes.value.exists
        ? errorRes.value.count
        : errorRes.status === 'fulfilled' ? null : prev.errorCount,
      schedulerLoaded: true,
    }))
  }, [])

  /* ── effects ──────────────────────────────────────────────────────── */
  useEffect(() => { initialLoadingRef.current = initialLoading }, [initialLoading])
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 10000); return () => clearInterval(t) }, [])

  useEffect(() => {
    let c = false; panelUpdateApi.getStatus().then(s => { if (!c) setPanelUpdate(s) }).catch(() => {}); return () => { c = true }
  }, [])

  useEffect(() => {
    let c = false; let hasPref = false
    try { hasPref = localStorage.getItem(DASHBOARD_VIEW_KEY) !== null } catch {}
    serversApi.getAll().then(({ servers }) => { if (c) return; setServerCount(servers.length); if (!hasPref && servers.length > 1) setView('cards') }).catch(() => {})
    return () => { c = true }
  }, [])

  useEffect(() => {
    let justSetUp = false
    try { justSetUp = sessionStorage.getItem('pz-just-completed-setup') === 'true' } catch {}
    if (!justSetUp) return
    try { sessionStorage.removeItem('pz-just-completed-setup') } catch {}
    let c = false
    serversApi.getAll()
      .then(({ servers }) => (servers.length === 0 ? serversApi.discoverMounts() : null))
      .then(data => { if (!c && data?.mounts?.length) setAutoDiscoveryMount(data.mounts[0]) })
      .catch(() => {})
    return () => { c = true }
  }, [])

  useEffect(() => {
    if (!socket) return
    const onAvailable = (data: { latestVersion?: string; currentVersion?: string; releaseUrl?: string }) => {
      setPanelUpdate(prev => ({ currentVersion: data.currentVersion || prev?.currentVersion || 'Unknown', updateAvailable: true, latestVersion: data.latestVersion || prev?.latestVersion || null, releaseUrl: data.releaseUrl || prev?.releaseUrl || null, releaseNotes: prev?.releaseNotes ?? null, publishedAt: prev?.publishedAt ?? null, isChecking: false, isDownloading: prev?.isDownloading ?? false, downloadProgress: prev?.downloadProgress ?? 0, lastCheck: prev?.lastCheck ?? null, lastError: null, stagedUpdate: prev?.stagedUpdate ?? null, lastApplyResult: prev?.lastApplyResult ?? null }))
    }
    const onApplied = () => setPanelUpdate(prev => prev ? { ...prev, updateAvailable: false } : prev)
    socket.on('panel:updateAvailable', onAvailable); socket.on('panel:updateApplied', onApplied)
    return () => { socket.off('panel:updateAvailable', onAvailable); socket.off('panel:updateApplied', onApplied) }
  }, [socket])

  useEffect(() => {
    const load = async () => {
      try {
        await Promise.allSettled([fetchStatus(), fetchPlayers(), fetchBridgeStatus()])
        setInitialLoading(false)
        void Promise.allSettled([fetchPlayerActivity(), fetchAutoStartSetting(), serverApi.getPanelInfo().then(setPanelInfo).catch(() => setPanelInfo(null)), fetchActiveServer(), fetchMaintenance()])
      } catch { setFetchError('Failed to load dashboard status.'); setInitialLoading(false) }
    }
    load()
    const loadTimeout = setTimeout(() => { if (initialLoadingRef.current) { setFetchError(c => c ?? 'The dashboard is taking longer than expected to respond.'); setInitialLoading(false) } }, 5000)
    const interval = setInterval(() => { if (document.visibilityState === 'hidden') return; fetchStatus(); fetchPlayers(); fetchPlayerActivity() }, 15000)
    const mInterval = setInterval(() => { if (document.visibilityState === 'hidden') return; fetchMaintenance() }, 60000)
    return () => { clearTimeout(loadTimeout); clearInterval(interval); clearInterval(mInterval); if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null } }
  }, [fetchStatus, fetchPlayers, fetchBridgeStatus, fetchPlayerActivity, fetchAutoStartSetting, fetchActiveServer, fetchMaintenance])

  useEffect(() => {
    if (!socket) return
    const onStatus = (data: Partial<ServerStatus>) => { setStatus(prev => { if (prev) return { ...prev, ...data }; if ('running' in data && 'configured' in data) return data as ServerStatus; return prev }); setLastUpdated(new Date()) }
    const onPlayers = (d: Player[]) => setPlayers(d)
    const onActiveServer = (d?: { server?: ServerInstance | null }) => { if (d?.server !== undefined) setActiveServer(d.server); else fetchActiveServer(); fetchStatus(); fetchPlayers(); fetchBridgeStatus() }
    const onBridgeMod = (d: { alive: boolean; version?: string; serverName?: string; playerCount?: number }) => {
      setBridgeStatus(prev => ({ configured: prev?.configured ?? true, isRunning: prev?.isRunning ?? true, modConnected: d.alive, modStatus: { alive: d.alive, version: d.version || prev?.modStatus?.version, serverName: d.serverName || prev?.modStatus?.serverName, playerCount: d.playerCount ?? 0 } }))
    }
    socket.on('server:status', onStatus); socket.on('players:update', onPlayers); socket.on('activeServerChanged', onActiveServer); socket.on('panelBridge:modStatus', onBridgeMod)
    return () => { socket.off('server:status', onStatus); socket.off('players:update', onPlayers); socket.off('activeServerChanged', onActiveServer); socket.off('panelBridge:modStatus', onBridgeMod) }
  }, [socket, fetchStatus, fetchPlayers, fetchBridgeStatus, fetchActiveServer])

  useEffect(() => {
    if (initialLoading || showPerformanceCharts) return
    let tid: ReturnType<typeof setTimeout> | null = null; let iid: number | null = null
    const reveal = () => setShowPerformanceCharts(true)
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) { iid = window.requestIdleCallback(reveal, { timeout: 1500 }) } else { tid = setTimeout(reveal, 300) }
    return () => { if (iid !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) window.cancelIdleCallback(iid); if (tid) clearTimeout(tid) }
  }, [initialLoading, showPerformanceCharts])

  useEffect(() => { if (showPerformanceCharts) fetchPerformanceHistory() }, [showPerformanceCharts, fetchPerformanceHistory])

  useEffect(() => {
    if (!socket || !showPerformanceCharts) return
    socket.emit('subscribe:perf')
    const onSnap = (snap: Record<string, unknown>) => {
      const point: PerformancePoint = { time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), timestamp: new Date().toISOString(), playerCount: (snap.playerCount as number) || 0, memoryMB: Math.round(((snap.memoryUsed as number) || 0) / (1024 * 1024)), pzMemMB: snap.pzMemUsed ? Math.round((snap.pzMemUsed as number) / (1024 * 1024)) : undefined, cpuPercent: snap.cpuUsage != null ? Math.round(snap.cpuUsage as number) : undefined, hostMemUsedGB: snap.hostMemUsed ? +((snap.hostMemUsed as number) / (1024 * 1024 * 1024)).toFixed(1) : undefined, hostMemTotalGB: snap.hostMemTotal ? +((snap.hostMemTotal as number) / (1024 * 1024 * 1024)).toFixed(1) : undefined, hostDiskUsedGB: snap.hostDiskUsed ? +((snap.hostDiskUsed as number) / (1024 * 1024 * 1024)).toFixed(1) : undefined, hostDiskTotalGB: snap.hostDiskTotal ? +((snap.hostDiskTotal as number) / (1024 * 1024 * 1024)).toFixed(1) : undefined }
      setPerformanceHistory(prev => { const next = [...prev, point]; return next.length > 60 ? next.slice(-60) : next })
    }
    socket.on('perf:snapshot', onSnap)
    return () => { socket.off('perf:snapshot', onSnap); socket.emit('unsubscribe:perf') }
  }, [socket, showPerformanceCharts])

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') { fetchStatus(); fetchPlayers(); fetchBridgeStatus(); fetchPlayerActivity(); if (showPerformanceCharts) fetchPerformanceHistory() } }
    document.addEventListener('visibilitychange', onVis); return () => document.removeEventListener('visibilitychange', onVis)
  }, [fetchStatus, fetchPlayers, fetchBridgeStatus, fetchPlayerActivity, fetchPerformanceHistory, showPerformanceCharts])

  /* ── actions ──────────────────────────────────────────────────────── */
  const handleAction = async (action: string, fn: () => Promise<unknown>) => {
    setLoading(action)
    try {
      const result = await fn()
      if (isFailedActionResult(result)) throw new Error(result.error || result.message || 'Action failed.')
      const copy = getDashboardSuccessCopy(action)
      toast({ title: copy.title, description: copy.description, variant: 'success' as const })
      if (action === 'Start server') {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        let attempts = 0
        pollIntervalRef.current = setInterval(async () => {
          attempts++
          try { const d = await serverApi.getStatus(); setStatus(d); if (d?.running || attempts >= 15) { if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null } } }
          catch { if (attempts >= 15 && pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null } }
        }, 2000)
      } else { fetchStatus() }
    } catch (error) { toast({ title: 'Error', ...errorToastContent(error, 'Action failed. Please try again.'), variant: 'destructive' }) }
    finally { setLoading(null) }
  }
  const handleConnect = async () => { await handleAction('Connect RCON', () => rconApi.connect()) }
  const handleAutoStartChange = async (checked: boolean) => {
    setAutoStartServer(checked)
    try { await configApi.updateAppSettings({ autoStartServer: String(checked) }); toast({ title: checked ? 'Auto-start enabled' : 'Auto-start disabled', description: checked ? 'Server will start automatically when the panel launches' : 'Server will not start automatically' }) }
    catch { setAutoStartServer(!checked); toast({ title: 'Error', description: 'Failed to save auto-start setting', variant: 'destructive' }) }
  }
  const dismissQuickStart = () => { setShowQuickStart(false); try { localStorage.setItem(DASHBOARD_ONBOARDING_DISMISSED_KEY, 'true') } catch {} }
  const changeView = (next: DashboardView) => { setView(next); try { localStorage.setItem(DASHBOARD_VIEW_KEY, next) } catch {} }
  const dismissPanelUpdate = (version: string) => { try { sessionStorage.setItem('panel-update-banner-dismissed', version) } catch {}; setPanelUpdateDismissedVersion(version) }

  usePageShortcut('r', () => { if (loading === null) fetchStatus() })

  /* ── derived ──────────────────────────────────────────────────────── */
  const hasServer = !!activeServer
  const online = hasServer && !!status?.running
  const modsPending = maintenance.modUpdatesAvailable > 0
  const staleLink = !lastUpdated || Date.now() - lastUpdated.getTime() > 60_000
  const latestPerf = performanceHistory[performanceHistory.length - 1]
  const maxMemoryGB = activeServer?.maxMemory
  const hostMemoryRatio = latestPerf?.hostMemUsedGB != null && latestPerf?.hostMemTotalGB ? latestPerf.hostMemUsedGB / latestPerf.hostMemTotalGB : null
  const hostCpu = latestPerf?.cpuPercent ?? null
  const diskFreeGB = latestPerf?.hostDiskUsedGB != null && latestPerf?.hostDiskTotalGB ? latestPerf.hostDiskTotalGB - latestPerf.hostDiskUsedGB : null
  const diskRatio = latestPerf?.hostDiskUsedGB != null && latestPerf?.hostDiskTotalGB ? latestPerf.hostDiskUsedGB / latestPerf.hostDiskTotalGB : null

  const joinedAt = new Map<string, string>()
  for (const event of playerActivity) { if (event.action === 'connect' && !joinedAt.has(event.player_name)) joinedAt.set(event.player_name, event.logged_at) }
  const presence: PlayerPresence[] = players.map(p => {
    const joined = joinedAt.get(p.name)
    if (!joined) return { name: p.name }
    const age = formatAge(joined)
    return { name: p.name, since: age === 'just now' ? 'just joined' : `for ${age.replace(' ago', '')}` }
  })

  const verdict: Verdict = computeVerdict({ hasServer, status, fetchError, online, activeServer, hostMemoryRatio, diskRatio, diskFreeGB, hostCpu, bridgeStatus, modsPending, maintenance, loading, handleAction, handleConnect, fetchStatus, fetchMaintenance })

  const backupState = maintenance.lastBackup ? `${maintenance.backupCount} stored, last ${formatAge(maintenance.lastBackup.created)}` : maintenance.backupCount > 0 ? `${maintenance.backupCount} stored` : 'none yet'
  const nextRunEta = maintenance.nextRun ? formatEta(maintenance.nextRun.at) : null
  const scheduleState = nextRunEta && maintenance.nextRun ? `${maintenance.nextRun.label} ${nextRunEta}` : maintenance.scheduledTasksCount > 0 ? `${maintenance.scheduledTasksCount} active` : 'none active'

  const workItems: WorkItem[] = [
    { to: '/players', icon: Activity, label: 'Players', state: online ? String(players.length) : 'offline', tone: !online ? 'bad' : players.length > 0 ? 'good' : 'default' },
    { to: '/console', icon: Wifi, label: 'Console', state: status?.rcon?.connected ? 'rcon ready' : 'rcon offline', tone: status?.rcon?.connected ? 'good' : 'warning' },
    { to: '/mods', icon: Gamepad2, label: 'Mods', state: modsPending ? `${maintenance.modUpdatesAvailable} to update` : `${maintenance.modsTracked} tracked`, tone: modsPending ? 'warning' : 'default' },
    { to: '/scheduler', icon: CalendarClock, label: 'Schedule', state: scheduleState, tone: nextRunEta ? 'good' : maintenance.scheduledTasksCount > 0 ? 'good' : 'default' },
    ...(maintenance.errorCount != null ? [{ to: '/console', icon: ScrollText, label: 'Errors', state: maintenance.errorCount === 0 ? 'none' : `${maintenance.errorCount} logged`, tone: maintenance.errorCount === 0 ? 'good' : maintenance.errorCount >= 50 ? 'warning' : 'default' } as WorkItem] : []),
    { to: '/backups', icon: Archive, label: 'Backups', state: backupState, tone: maintenance.backupCount === 0 ? 'warning' : 'good' },
    { to: '/server-config', icon: Server, label: 'Config' },
  ]

  return {
    // state
    status, players, bridgeStatus, playerActivity, performanceHistory,
    loading, initialLoading, fetchError, lastUpdated, activeServer,
    showPerformanceCharts, serverCount, view, showQuickStart,
    panelUpdate, panelUpdateDismissedVersion, maintenance,
    autoStartServer, autoDiscoveryMount, panelInfo,
    // derived
    hasServer, online, staleLink, maxMemoryGB, presence, verdict, workItems,
    // actions
    handleAction, handleConnect, handleAutoStartChange,
    fetchStatus, fetchMaintenance,
    dismissQuickStart, changeView, dismissPanelUpdate,
    setAutoDiscoveryMount,
  }
}

/* ── verdict computation ──────────────────────────────────────────── */
interface VerdictInputs {
  hasServer: boolean; status: ServerStatus | null; fetchError: string | null
  online: boolean; activeServer: ServerInstance | null
  hostMemoryRatio: number | null; diskRatio: number | null; diskFreeGB: number | null; hostCpu: number | null
  bridgeStatus: BridgeStatus | null; modsPending: boolean; maintenance: MaintenanceState; loading: string | null
  handleAction: (action: string, fn: () => Promise<unknown>) => void
  handleConnect: () => Promise<void>
  fetchStatus: () => Promise<void>; fetchMaintenance: () => Promise<void>
}

function computeVerdict(v: VerdictInputs): Verdict {
  if (!v.hasServer || (v.status && !v.status.configured)) return { level: 'warning', headline: 'No server configured', action: { label: 'Open setup', to: '/server-setup' } }
  if (v.fetchError) return { level: 'critical', headline: 'Panel cannot reach the server', detail: v.fetchError, action: { label: 'Retry', onClick: () => { void v.fetchStatus() } } }
  if (!v.online) return { level: 'critical', headline: 'Server stopped', action: v.activeServer?.isRemote ? undefined : { label: 'Start server', onClick: () => { void v.handleAction('Start server', serverApi.start) }, busy: v.loading === 'Start server', disabled: v.loading !== null } }
  if (!v.status?.rcon?.connected) return { level: 'warning', headline: 'RCON disconnected', action: { label: 'Connect RCON', onClick: () => { void v.handleConnect() }, busy: v.loading === 'Connect RCON', disabled: v.loading !== null } }
  if (v.hostMemoryRatio != null && v.hostMemoryRatio >= 0.9) return { level: 'critical', headline: `Host memory ${Math.round(v.hostMemoryRatio * 100)}%` }
  if (v.diskRatio != null && v.diskFreeGB != null && v.diskRatio >= 0.95) return { level: 'critical', headline: `Disk almost full, ${v.diskFreeGB.toFixed(0)} GB left` }
  if (v.diskRatio != null && v.diskFreeGB != null && v.diskRatio >= 0.9) return { level: 'warning', headline: `Disk ${Math.round(v.diskRatio * 100)}%, ${v.diskFreeGB.toFixed(0)} GB left` }
  if (v.hostCpu != null && v.hostCpu >= 90) return { level: 'warning', headline: `Host CPU ${v.hostCpu}%` }
  // Skip bridge check for Docker-managed servers — filesystem IPC doesn't work across containers
  if (v.bridgeStatus?.configured && !v.bridgeStatus.modConnected && v.activeServer?.provider !== 'docker-managed') return { level: 'warning', headline: 'PanelBridge offline', action: { label: 'Bridge settings', to: '/settings' } }
  if (v.modsPending) return { level: 'warning', headline: `${v.maintenance.modUpdatesAvailable} mod update${v.maintenance.modUpdatesAvailable === 1 ? '' : 's'} waiting`, action: { label: 'Review mods', to: '/mods' } }
  if (v.maintenance.schedulerLoaded && v.maintenance.backupCount === 0 && !v.activeServer?.isRemote) return { level: 'warning', headline: 'No backups', action: { label: 'Create backup', onClick: () => { void v.handleAction('Create backup', () => backupApi.createBackup({ includeDb: true }).then(() => v.fetchMaintenance())) }, busy: v.loading === 'Create backup', disabled: v.loading !== null } }
  return { level: 'calm' }
}
