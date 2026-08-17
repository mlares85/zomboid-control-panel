import { useState, useEffect, useContext, useRef, useCallback } from 'react'
import {
  Server,
  Trash2,
  Edit2,
  Check,
  Power,
  MoreVertical,
  Loader2,
  FolderOpen,
  Download,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Info,
  Globe,
  Wifi,
  HardDrive,
  Database,
  ArrowRight,
  GitBranch,
  Cpu,
  Network,
  Play,
  Square,
  Link,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { reportClientError, reportClientWarning } from '@/lib/client-errors'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { serversApi, serversDetectApi, ServerInstance, configApi, serverApi, updateApi, UpdateStatus, ComposedServerStatus, dockerApi } from '@/lib/api'
import { ServerStatusBadge } from '@/components/ServerStatusBadge'
import { SocketContext } from '@/contexts/SocketContext'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { AddServerFlow } from '@/components/addServer/AddServerFlow'

export default function Servers() {
  const [servers, setServers] = useState<ServerInstance[]>([])
  const [serverStatuses, setServerStatuses] = useState<Record<string, { running: boolean; pid: string | null }>>({})
  // Full 3-signal status (host/RCON/bridge) for the active server only — the
  // other servers' cards fall back to the host-only signal in serverStatuses.
  const [activeStatus, setActiveStatus] = useState<ComposedServerStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingServer, setEditingServer] = useState<ServerInstance | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleteServer, setDeleteServer] = useState<ServerInstance | null>(null)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [deleteContainer, setDeleteContainer] = useState(false)
  const [deleteBaseFiles, setDeleteBaseFiles] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState(0)
  const deleteProgressRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [activating, setActivating] = useState<string | number | null>(null)

  // Add server flow — unified AddServerFlow dialog (replaces the old
  // per-mode Add dialog; see client/src/components/addServer/AddServerFlow.tsx)
  const [showAddFlow, setShowAddFlow] = useState(false)

  // Steam update/verify state
  const [steamOperation, setSteamOperation] = useState<{ server: ServerInstance; type: 'update' | 'verify'; branch: string } | null>(null)
  const [steamLogs, setSteamLogs] = useState<string[]>([])
  const [steamRunning, setSteamRunning] = useState(false)
  const [steamCompleted, setSteamCompleted] = useState<'success' | 'error' | null>(null)
  const [clearingInstall, setClearingInstall] = useState(false)
  const [confirmClearInstall, setConfirmClearInstall] = useState(false)
  const [steamcmdPath, setSteamcmdPath] = useState('')
  const [updateInfo, setUpdateInfo] = useState<UpdateStatus | null>(null)
  const [gameVersion, setGameVersion] = useState<string | null>(null)
  const [availableBranches, setAvailableBranches] = useState<Array<{name: string, description: string, buildId?: string | null, timeUpdated?: string | null}>>([
    { name: 'public', description: 'Public (Stable)' },
    { name: 'unstable', description: 'Unstable beta' }
  ])
  const [loadingBranches, setLoadingBranches] = useState(false)

  const { toast } = useToast()
  const socket = useContext(SocketContext)
  const navigate = useNavigate()



  // Fetch servers
  const fetchServers = useCallback(async () => {
    try {
      const data = await serversApi.getAll()
      setServers(data.servers || [])
    } catch (error) {
      reportClientError('Failed to fetch servers.', error)
      toast({ title: 'Error', description: 'Failed to load servers', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  // Per-server running status — scans host processes once and attributes
  // matches to each configured server's install path. Refreshes on a slow
  // 15s cadence (process detection is heavyweight) and on socket events.
  // Skipped while the tab is hidden so background tabs don't keep firing
  // a heavyweight host-process scan.
  const fetchServerStatuses = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    try {
      const data = await serversApi.getStatus()
      const next: Record<string, { running: boolean; pid: string | null }> = {}
      for (const s of data.servers || []) {
        next[String(s.id)] = { running: !!s.running, pid: s.pid }
      }
      setServerStatuses(next)
    } catch (error) {
      // Non-fatal: status is supplemental info, not the source of truth.
      reportClientWarning('Failed to fetch per-server status.', error)
    }
  }, [])

  // Provider-aware host/RCON/bridge status for whichever server is active —
  // shown on its card via ServerStatusBadge instead of a single Running/
  // Stopped flag that hides RCON/bridge trouble behind a "running" container.
  const fetchActiveStatus = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    try {
      setActiveStatus(await serversApi.getComposedStatus())
    } catch (error) {
      // Non-fatal: falls back to the "—" placeholder on the card.
      reportClientWarning('Failed to fetch active server status.', error)
    }
  }, [])

  // Load steamcmd path and servers on mount
  useEffect(() => {
    fetchServers()
    fetchServerStatuses()
    fetchActiveStatus()
    const statusInterval = setInterval(fetchServerStatuses, 15000)
    const activeStatusInterval = setInterval(fetchActiveStatus, 10000)
    // Load steamcmd path from settings
    configApi.getAppSettings().then(data => {
      if (data.settings?.steamcmdPath) {
        setSteamcmdPath(data.settings.steamcmdPath)
      }
    }).catch(e => reportClientWarning('Failed to load settings.', e))
    // Load update status
    updateApi.getStatus().then(status => {
      if (status.updateAvailable?.updateAvailable) {
        setUpdateInfo(status.updateAvailable)
      }
      if (status.gameVersion) {
        setGameVersion(status.gameVersion)
      }
    }).catch(e => reportClientWarning('Failed to load update status.', e))
    return () => {
      clearInterval(statusInterval)
      clearInterval(activeStatusInterval)
    }
  }, [fetchServers, fetchServerStatuses, fetchActiveStatus])

  // Listen for update status changes (clears banner after successful update)
  useEffect(() => {
    if (!socket) return

    const handleUpdateAvailable = (data: UpdateStatus) => {
      setUpdateInfo(data.updateAvailable ? data : null)
    }
    const handleUpdateCheck = (data: UpdateStatus) => {
      setUpdateInfo(data.updateAvailable ? data : null)
    }

    socket.on('server:updateAvailable', handleUpdateAvailable)
    socket.on('server:updateCheck', handleUpdateCheck)
    return () => {
      socket.off('server:updateAvailable', handleUpdateAvailable)
      socket.off('server:updateCheck', handleUpdateCheck)
    }
  }, [socket])

  // Fetch available Steam branches when steam operation dialog opens
  useEffect(() => {
    if (!steamOperation) return

    const fetchBranches = async () => {
      setLoadingBranches(true)
      try {
        const detection = await serverApi.detectSteamCmd()
        const resolvedSteamcmdPath = detection.found && detection.path ? detection.path : steamcmdPath
        if (resolvedSteamcmdPath && resolvedSteamcmdPath !== steamcmdPath) {
          setSteamcmdPath(resolvedSteamcmdPath)
        }
        const data = await serverApi.getBranches(resolvedSteamcmdPath)
        if (data.branches && Array.isArray(data.branches)) {
          setAvailableBranches(() => {
            const fetched = data.branches as Array<{ name: string; description: string; buildId?: string | null }>
            // SteamCMD's anonymous branch listing usually only returns `public`.
            // Make sure the installed branch, the server's branch, and the currently
            // selected branch all remain pickable so we never silently drop the user's choice.
            const extras: typeof fetched = []
            const have = new Set(fetched.map(b => b.name))
            const normalize = (v: string | undefined | null) => (v || '').trim().toLowerCase()
            const candidates = [
              normalize(updateInfo?.installed?.branch),
              normalize(steamOperation?.server.branch),
              normalize(steamOperation?.branch),
            ].filter(Boolean) as string[]
            for (const name of candidates) {
              if (!have.has(name)) {
                const description = name === 'unstable'
                  ? 'Build 42 testing branch. Back up saves and expect mod incompatibilities.'
                  : name === 'iwbums'
                    ? 'Experimental testing branch. Back up saves before switching.'
                    : 'Beta branch selected for this server.'
                extras.push({ name, description })
                have.add(name)
              }
            }
            return [...fetched, ...extras]
          })
          // Only reconcile the selected branch if it's truly unknown and not the
          // installed/server branch. Never override what the server is actually running.
          setSteamOperation((prev) => {
            if (!prev) return prev
            const names = new Set(data.branches.map((b: { name: string }) => b.name))
            const installed = (updateInfo?.installed?.branch || '').trim().toLowerCase()
            const serverBranch = (prev.server.branch || '').trim().toLowerCase()
            if (prev.branch === installed) return prev
            if (prev.branch === serverBranch) return prev
            if (names.has(prev.branch)) return prev
            const fallback = installed || serverBranch || (names.has('public') ? 'public' : data.branches[0]?.name)
            return fallback ? { ...prev, branch: fallback } : prev
          })
        }
      } catch (error) {
        reportClientError('Failed to fetch branches.', error)
        // Keep default branches on error
      } finally {
        setLoadingBranches(false)
      }
    }

    fetchBranches()
  }, [steamOperation, steamcmdPath, updateInfo?.installed?.branch])

  // Listen for server changes
  useEffect(() => {
    if (!socket) return

    const handleActiveServerChanged = () => {
      fetchServers()
      fetchActiveStatus()
    }

    socket.on('activeServerChanged', handleActiveServerChanged)
    return () => {
      socket.off('activeServerChanged', handleActiveServerChanged)
    }
  }, [socket, fetchServers, fetchActiveStatus])

  // Listen for Steam update/verify events
  useEffect(() => {
    if (!socket) return

    const handleSteamStart = (data: { type: string; message: string }) => {
      setSteamRunning(true)
      setSteamLogs([data.message])
    }

    const handleSteamLog = (data: { type: string; text: string }) => {
      setSteamLogs(prev => [...prev.slice(-200), data.text]) // Keep last 200 lines
    }

    const handleSteamComplete = (data: { success: boolean; message: string }) => {
      setSteamRunning(false)
      setSteamCompleted(data.success ? 'success' : 'error')
      setSteamLogs(prev => [...prev, '', data.success ? '✓ ' + data.message : '✗ ' + data.message])
      toast({
        title: data.success ? 'Success' : 'Failed',
        description: data.message,
        variant: data.success ? 'default' : 'destructive'
      })
    }

    socket.on('steam:start', handleSteamStart)
    socket.on('steam:log', handleSteamLog)
    socket.on('steam:complete', handleSteamComplete)

    return () => {
      socket.off('steam:start', handleSteamStart)
      socket.off('steam:log', handleSteamLog)
      socket.off('steam:complete', handleSteamComplete)
    }
  }, [socket, toast])


  const handleActivateServer = useCallback(async (server: ServerInstance) => {
    if (server.isActive) return

    setActivating(server.id)
    try {
      await serversApi.activate(server.id)
      toast({
        title: 'Server Activated',
        description: `Now managing: ${server.name}`
      })
      fetchServers()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to activate server',
        variant: 'destructive'
      })
    } finally {
      setActivating(null)
    }
  }, [toast, fetchServers])

  // Inline Start/Stop on server cards. The Node side `serverApi.start/stop`
  // operate on the currently-active instance only, so for inactive servers
  // we activate first, wait for the switch to land, then issue start. This
  // mirrors what users would otherwise do manually from the dropdown.
  const [serverActionPending, setServerActionPending] = useState<string | null>(null)
  const handleInlineStart = useCallback(async (server: ServerInstance) => {
    setServerActionPending(`start-${server.id}`)
    try {
      if (!server.isActive) {
        await serversApi.activate(server.id)
      }
      await serverApi.start()
      toast({ title: 'Server Starting', description: server.name || server.serverName })
      fetchServers()
      fetchServerStatuses()
    } catch (error) {
      toast({
        title: 'Failed to start server',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setServerActionPending(null)
    }
  }, [toast, fetchServers, fetchServerStatuses])

  const handleInlineStop = useCallback(async (server: ServerInstance) => {
    setServerActionPending(`stop-${server.id}`)
    try {
      if (!server.isActive) {
        await serversApi.activate(server.id)
      }
      await serverApi.stop()
      toast({ title: 'Server Stopping', description: server.name || server.serverName })
      fetchServers()
      fetchServerStatuses()
    } catch (error) {
      toast({
        title: 'Failed to stop server',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setServerActionPending(null)
    }
  }, [toast, fetchServers, fetchServerStatuses])

  const handleDeleteServer = async () => {
    if (!deleteServer) return

    setDeleting(true)
    setDeleteProgress(0)

    // Animate progress: fast to ~70%, then slow crawl to ~90%
    let prog = 0
    deleteProgressRef.current = setInterval(() => {
      prog += prog < 70 ? 8 : 1
      if (prog > 92) prog = 92
      setDeleteProgress(prog)
    }, 200)

    const isManaged = !!deleteServer.dockerContainerId && deleteServer.provider === 'docker-managed'

    try {
      // Non-managed: honor the legacy deleteFiles checkbox
      if (!isManaged && deleteFiles && deleteServer.installPath) {
        try {
          const result = await serversDetectApi.deleteFiles(deleteServer.installPath) as { error?: string }
          if (result?.error) {
            toast({ title: 'File deletion failed', description: result.error, variant: 'destructive' })
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Could not delete server files'
          toast({ title: 'Warning', description: `${msg} — removing from panel anyway.`, variant: 'destructive' })
        }
      }

      // Docker-managed: delete container if requested (sends removeData
      // so the per-server data volume is also removed)
      if (isManaged && deleteContainer) {
        try {
          await dockerApi.deleteManagedServer(deleteServer.id, true)
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Could not remove container'
          toast({ title: 'Warning', description: `${msg} — removing from panel anyway.`, variant: 'destructive' })
        }
      }

      // Docker-managed: delete shared base game files if requested
      if (isManaged && deleteBaseFiles) {
        try {
          await dockerApi.deleteBaseVolume()
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Could not delete base game files'
          toast({ title: 'Warning', description: msg, variant: 'destructive' })
        }
      }

      // Remove the panel record — for managed servers with deleteContainer,
      // the managed DELETE route already does this; otherwise call directly.
      if (!(isManaged && deleteContainer)) {
        await serversApi.delete(deleteServer.id)
      }

      // Complete the progress bar before closing
      if (deleteProgressRef.current) clearInterval(deleteProgressRef.current)
      setDeleteProgress(100)
      await new Promise(r => setTimeout(r, 350))

      const parts: string[] = ['Removed from panel']
      if (isManaged && deleteContainer) parts.push('container deleted')
      if (isManaged && deleteBaseFiles) parts.push('base game files deleted')
      if (!isManaged && deleteFiles) parts.push('server files deleted')
      toast({ title: 'Deleted', description: `"${deleteServer.name}" — ${parts.join(', ')}.` })
      setDeleteServer(null)
      setDeleteFiles(false)
      setDeleteContainer(false)
      setDeleteBaseFiles(false)
      fetchServers()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete server',
        variant: 'destructive'
      })
    } finally {
      if (deleteProgressRef.current) clearInterval(deleteProgressRef.current)
      setDeleting(false)
      setDeleteProgress(0)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingServer || savingEdit) return

    // Validate port range
    if (editingServer.rconPort < 1 || editingServer.rconPort > 65535) {
      toast({ title: 'Error', description: 'RCON port must be between 1 and 65535', variant: 'destructive' })
      return
    }

    setSavingEdit(true)
    try {
      await serversApi.update(editingServer.id, editingServer)
      toast({ title: 'Saved', description: 'Server settings updated' })
      setEditingServer(null)
      fetchServers()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update server',
        variant: 'destructive'
      })
    } finally {
      setSavingEdit(false)
    }
  }

  // Start Steam update/verify operation
  const handleStartSteamOperation = async () => {
    if (!steamOperation || !steamcmdPath.trim()) {
      toast({ title: 'Error', description: 'Please enter the SteamCMD path', variant: 'destructive' })
      return
    }

    const installFolder = getInstallFolder(steamOperation.server.installPath)
    if (!installFolder) {
      toast({ title: 'Error', description: 'Server install path not configured', variant: 'destructive' })
      return
    }

    // Save steamcmd path to settings for future use
    try {
      await configApi.updateAppSettings({ steamcmdPath })
    } catch (e) {
      // Non-critical, continue anyway
    }

    setSteamLogs([])
    setSteamRunning(true)
    setSteamCompleted(null)

    try {
      if (steamOperation.type === 'verify') {
        await serversApi.steamVerify(steamcmdPath, installFolder, steamOperation.branch)
      } else {
        await serversApi.steamUpdate(steamcmdPath, installFolder, steamOperation.branch)
      }
    } catch (error) {
      setSteamRunning(false)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start operation',
        variant: 'destructive'
      })
    }
  }

  // Wipe the install folder so a stuck/corrupted SteamCMD state (partial
  // download, mismatched appmanifest, "Missing configuration" etc.) can be
  // fixed by reinstalling from scratch, without needing shell access.
  // Reuses the same guarded /delete-files endpoint the "Remove Server ->
  // Delete Everything" flow uses (requires PZ marker files to be present,
  // refuses to delete folders it doesn't recognize as a PZ install).
  const handleClearInstallFolder = async () => {
    if (!steamOperation) return
    const installFolder = getInstallFolder(steamOperation.server.installPath)
    if (!installFolder) {
      toast({ title: 'Error', description: 'Server install path not configured', variant: 'destructive' })
      return
    }

    setClearingInstall(true)
    try {
      const result = await serversDetectApi.deleteFiles(installFolder) as { error?: string }
      if (result?.error) {
        toast({ title: 'Could Not Clear Folder', description: result.error, variant: 'destructive' })
        return
      }
      setSteamLogs([])
      setSteamCompleted(null)
      toast({
        title: 'Installation Folder Cleared',
        description: 'The folder was wiped. Click Start Update to reinstall from scratch.',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to clear installation folder',
        variant: 'destructive',
      })
    } finally {
      setClearingInstall(false)
      setConfirmClearInstall(false)
    }
  }

  // Open steam operation dialog
  const openSteamOperation = async (server: ServerInstance, type: 'update' | 'verify') => {
    // Prefer the branch that's actually installed on disk (from steamcmd appmanifest),
    // then fall back to the server's stored branch, then to Steam's default 'public'.
    // Steam's stable branch is named 'public'; map legacy 'stable' to it so it matches the fetched list.
    const normalize = (v: string | undefined | null) => (v || '').trim().toLowerCase()
    const installed = normalize(updateInfo?.installed?.branch)
    const stored = normalize(server.branch)
    const pick = installed || stored
    const initialBranch = !pick || pick === 'stable' ? 'public' : pick
    setSteamOperation({ server, type, branch: initialBranch })
    setSteamLogs([])
    setSteamRunning(false)
    setSteamCompleted(null)

    // Load steamcmd path from settings if not already set
    if (!steamcmdPath) {
      try {
        const data = await configApi.getAppSettings()
        if (data.settings?.steamcmdPath) {
          setSteamcmdPath(data.settings.steamcmdPath)
        }
      } catch (e) {
        // Ignore - user can enter manually
      }
    }
  }

  // Get clean install path (folder only, not batch file)
  const getInstallFolder = (installPath: string | undefined): string => {
    if (!installPath) return ''
    // If path ends with a script/executable, get the parent folder
    if (/\.(bat|sh|exe)$/i.test(installPath)) {
      const lastSlash = Math.max(installPath.lastIndexOf('\\'), installPath.lastIndexOf('/'))
      return lastSlash > 0 ? installPath.substring(0, lastSlash) : installPath
    }
    return installPath
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 page-transition">
      {/* Header */}
      <PageHeader
        title="Managed Servers"
        description="Manage multiple Project Zomboid servers from one panel"
        eyebrow="Fleet"
        tone="servers"
        icon={<Server className="w-5 h-5 text-primary" />}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowAddFlow(true)}>
              <Wifi className="w-4 h-4 mr-2" /> Add Server
            </Button>
            <Button variant="command" onClick={() => navigate('/server-setup')}>
              <Download className="w-4 h-4 mr-2" /> Install New Server
            </Button>
          </div>
        }
      />

      {/* Server Grid */}
      {servers.length === 0 ? (
        <Card className="mission-brief overflow-hidden border-primary/20 bg-card">
          <CardContent className="py-10">
            <div className="mx-auto max-w-4xl space-y-8">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                  <Server className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-semibold text-foreground">No Servers Configured</h3>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Start with one server. After it is active, dashboard, players, backups, mods, and remote actions come online.
                </p>
              </div>

              <div className="mission-step-grid grid gap-4 md:grid-cols-3">
                <div className="mission-step-card rounded-2xl border border-border/60 bg-background/40 p-5">
                  <div className="mission-step-icon mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <FolderOpen className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">Add an existing local server</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Use this when server files already exist on this machine.
                  </p>
                  <Button variant="outline" className="onboarding-cta mt-4 w-full" onClick={() => setShowAddFlow(true)}>
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Add Existing Server
                  </Button>
                </div>

                <div className="mission-step-card rounded-2xl border border-border/60 bg-background/40 p-5">
                  <div className="mission-step-icon mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <Download className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">Install a new local server</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Use the installer when you need files, ports, passwords, and memory setup in one flow.
                  </p>
                  <Button className="onboarding-cta mt-4 w-full" onClick={() => navigate('/server-setup')}>
                    <Download className="mr-2 h-4 w-4" />
                    Install New Server
                  </Button>
                </div>

                <div className="mission-step-card rounded-2xl border border-border/60 bg-background/40 p-5">
                  <div className="mission-step-icon mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <Globe className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">Connect a remote server</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Use this for servers running on another machine through RCON.
                  </p>
                  <Button variant="secondary" className="onboarding-cta mt-4 w-full" onClick={() => setShowAddFlow(true)}>
                    <Globe className="mr-2 h-4 w-4" />
                    Add Remote Server
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border border-border/60 bg-background/30 p-5 md:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Step 1</p>
                  <p className="mt-1 text-sm font-medium text-foreground">Bring in one server</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Step 2</p>
                  <p className="mt-1 text-sm font-medium text-foreground">Set it active and verify RCON</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Step 3</p>
                  <p className="mt-1 text-sm font-medium text-foreground">Return to Dashboard for live control</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 stagger-in">
          {servers.map(server => {
            const hasUpdate = updateInfo?.updateAvailable && server.isActive
            return (
            <Card
              key={server.id}
              className={`relative overflow-hidden transition-colors ${
                server.isActive
                  ? 'border-primary/60 ring-1 ring-primary/25 bg-gradient-to-br from-primary/[0.04] via-card to-card'
                  : 'hover:border-primary/30'
              } ${hasUpdate ? 'border-warning/60' : ''}`}
            >
              {/* Active indicator bar — thicker gradient stripe when active */}
              {server.isActive && (
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary via-primary/80 to-primary/40" aria-hidden="true" />
              )}
              {hasUpdate && !server.isActive && (
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-warning via-warning/80 to-warning/40" aria-hidden="true" />
              )}

              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <CardTitle className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="truncate">{server.name}</span>
                      {server.isActive ? (
                        <Badge variant="default" className="text-xs">
                          <Check className="w-3 h-3 mr-1" /> Selected
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                      {(() => {
                        // The selected server has real RCON/bridge signals from the
                        // composed status endpoint; every other card only knows
                        // whatever the host-process scan found for it.
                        if (server.isActive && activeStatus) {
                          return (
                            <ServerStatusBadge
                              compact
                              host={activeStatus.host}
                              server={activeStatus.server}
                              bridge={activeStatus.bridge}
                            />
                          )
                        }
                        const status = serverStatuses[String(server.id)]
                        const host = status
                          ? { status: status.running ? 'running' : 'stopped', label: 'Process' }
                          : undefined
                        return <ServerStatusBadge compact host={host} />
                      })()}
                      {server.isRemote && (
                        <Badge variant="outline" className="text-xs">
                          <Globe className="w-3 h-3 mr-1" /> Remote
                        </Badge>
                      )}
                      {hasUpdate && (
                        <Badge variant="warning" className="text-xs">
                          <RefreshCw className="w-3 h-3 mr-1" /> Update Available
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="font-mono text-xs">
                      {server.serverName}
                    </CardDescription>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="iconDense" className="shrink-0" aria-label={`Options for ${server.name || server.serverName}`}>
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingServer({ ...server })}>
                        <Edit2 className="w-4 h-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      {!server.isActive && (
                        <DropdownMenuItem onClick={() => handleActivateServer(server)} disabled={activating !== null}>
                          <Power className="w-4 h-4 mr-2" /> Set Active
                        </DropdownMenuItem>
                      )}
                      {!server.isRemote && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openSteamOperation(server, 'update')}>
                            <RefreshCw className="w-4 h-4 mr-2" /> Update Server
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openSteamOperation(server, 'verify')}>
                            <ShieldCheck className="w-4 h-4 mr-2" /> Verify Files
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteServer(server)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Remove from Panel
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Paths Section */}
                {!server.isRemote && (server.installPath || server.zomboidDataPath) && (
                  <div className="rounded-md border border-border/40 bg-muted/15 divide-y divide-border/30">
                    {server.installPath && (
                      <div className="flex items-start gap-2.5 px-3 py-2">
                        <HardDrive className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Install Path</p>
                          <p className="font-mono text-xs text-foreground/85 truncate mt-0.5" title={server.installPath}>{server.installPath}</p>
                        </div>
                      </div>
                    )}
                    {server.zomboidDataPath && (
                      <div className="flex items-start gap-2.5 px-3 py-2">
                        <Database className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Data Path</p>
                          <p className="font-mono text-xs text-foreground/85 truncate mt-0.5" title={server.zomboidDataPath}>{server.zomboidDataPath}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Network & Config Grid */}
                <div className={`grid ${server.isRemote ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'} gap-2`}>
                  <div className="flex items-center gap-2.5 rounded-md border border-border/50 bg-muted/20 px-2.5 py-2">
                    <div className="grid place-items-center w-7 h-7 rounded-md border border-primary/25 bg-primary/[0.06] text-primary shrink-0" aria-hidden="true">
                      <Network className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">RCON</p>
                      <p className="font-mono text-xs text-foreground/90 truncate tabular-nums">{server.rconHost}:{server.rconPort}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-md border border-border/50 bg-muted/20 px-2.5 py-2">
                    <div className="grid place-items-center w-7 h-7 rounded-md border border-primary/25 bg-primary/[0.06] text-primary shrink-0" aria-hidden="true">
                      <Globe className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Game Port</p>
                      <p className="font-mono text-xs text-foreground/90 tabular-nums">{server.serverPort}</p>
                    </div>
                  </div>
                  {!server.isRemote && (
                    <div className="flex items-center gap-2.5 rounded-md border border-border/50 bg-muted/20 px-2.5 py-2">
                      <div className="grid place-items-center w-7 h-7 rounded-md border border-border/55 bg-muted/40 text-muted-foreground shrink-0" aria-hidden="true">
                        <Cpu className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Memory</p>
                        <p className="font-mono text-xs text-foreground/90 tabular-nums">{server.minMemory}–{server.maxMemory} GB</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Branch & Build Info (if update info available for active server) */}
                {server.isActive && (updateInfo || gameVersion) && (
                  <div className="p-2.5 rounded-md bg-muted/50 border border-border/50">
                    <div className="flex items-center justify-between flex-wrap gap-y-1">
                      <div className="flex items-center gap-2">
                        {gameVersion && (
                          <Badge variant="outline" className="text-xs font-mono">v{gameVersion}</Badge>
                        )}
                        {updateInfo && (
                          <>
                            <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                            <Badge variant="secondary" className="text-xs font-mono">{updateInfo.installed.branch}</Badge>
                          </>
                        )}
                      </div>
                      {updateInfo && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Build:</span>
                          <span className="font-mono font-medium">{updateInfo.installed.buildId}</span>
                          {updateInfo.updateAvailable && (
                            <>
                              <ArrowRight className="w-3 h-3 text-warning" />
                              <span className="font-mono font-semibold text-warning">{updateInfo.latest.buildId}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Server branch badge for non-active */}
                {!server.isActive && server.branch && (
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Branch:</span>
                    <Badge variant="secondary" className="text-xs font-mono">{server.branch}</Badge>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {(() => {
                    const status = serverStatuses[String(server.id)]
                    const isRunning = status?.running ?? false
                    const startPending = serverActionPending === `start-${server.id}`
                    const stopPending = serverActionPending === `stop-${server.id}`
                    if (server.isRemote) return null
                    return isRunning ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleInlineStop(server)}
                        disabled={stopPending || serverActionPending !== null}
                        title="Stop this server"
                      >
                        {stopPending ? (
                          <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Stopping...</>
                        ) : (
                          <><Square className="w-4 h-4 mr-1.5" /> Stop</>
                        )}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleInlineStart(server)}
                        disabled={startPending || serverActionPending !== null}
                        title={server.isActive ? 'Start this server' : 'Switch to this server and start it'}
                      >
                        {startPending ? (
                          <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Starting...</>
                        ) : (
                          <><Play className="w-4 h-4 mr-1.5" /> Start</>
                        )}
                      </Button>
                    )
                  })()}
                  {server.isRemote && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate('/settings?tab=bridge')}
                      title="Configure the SFTP bridge for this remote server"
                    >
                      <Link className="w-4 h-4 mr-1.5" /> Configure SFTP Bridge
                    </Button>
                  )}
                  {hasUpdate && (
                    <Button
                      size="sm"
                      variant="warning"
                      onClick={() => openSteamOperation(server, 'update')}
                    >
                      <RefreshCw className="w-4 h-4 mr-1.5" /> Update Now
                    </Button>
                  )}
                  {!server.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleActivateServer(server)}
                      disabled={activating === server.id}
                    >
                      {activating === server.id ? (
                        <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Activating...</>
                      ) : (
                        <><Power className="w-4 h-4 mr-1.5" /> Switch to This Server</>
                      )}
                    </Button>
                  )}
                </div>

                {/* Created date */}
                {server.createdAt && (
                  <p className="text-[11px] text-muted-foreground/60 pt-1">
                    Added {new Date(server.createdAt).toLocaleDateString()}
                  </p>
                )}
              </CardContent>
            </Card>
          )})}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingServer} onOpenChange={() => setEditingServer(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Server</DialogTitle>
            <DialogDescription>
              Update server configuration settings
            </DialogDescription>
          </DialogHeader>

          {editingServer && (
            <div className="space-y-4">
              {/* Remote server indicator */}
              {editingServer.isRemote && (
                <Alert className="border-primary/20 bg-primary/5">
                  <Globe className="h-4 w-4 text-primary" />
                  <AlertTitle>Remote Server</AlertTitle>
                  <AlertDescription>RCON-only management is available for this server.</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input
                    value={editingServer.name}
                    onChange={e => setEditingServer({ ...editingServer, name: e.target.value })}
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Server Name</Label>
                  <Input
                    value={editingServer.serverName}
                    onChange={e => setEditingServer({ ...editingServer, serverName: e.target.value })}
                    maxLength={64}
                  />
                </div>
              </div>

              {!editingServer.isRemote && (
              <>
              <div className="space-y-2">
                <Label>Install Path</Label>
                <Input
                  value={editingServer.installPath}
                  onChange={e => setEditingServer({ ...editingServer, installPath: e.target.value })}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label>Zomboid Data Path</Label>
                <Input
                  value={editingServer.zomboidDataPath || ''}
                  onChange={e => setEditingServer({ ...editingServer, zomboidDataPath: e.target.value })}
                  className="font-mono text-sm"
                  placeholder="Leave empty for default"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  Custom Start Command
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[280px]">
                      <p className="text-xs">Override the default startup script with a custom command. Supports arguments. Leave empty to use the default bat/sh file detection.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input
                  value={editingServer.startCommand || ''}
                  onChange={e => setEditingServer({ ...editingServer, startCommand: e.target.value })}
                  className="font-mono text-sm"
                  placeholder="e.g. ./start-server.sh -servername MyServer"
                  maxLength={1024}
                />
                {editingServer.startCommand && /[&|;<>`${}()!\[\]]/.test(editingServer.startCommand) && (
                  <p className="text-xs text-destructive">Command contains disallowed shell characters</p>
                )}
              </div>
              </>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    RCON Host
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px]">
                        <p className="text-xs">Leave as 127.0.0.1 if the panel runs on the same machine as the game server</p>
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input
                    value={editingServer.rconHost}
                    onChange={e => setEditingServer({ ...editingServer, rconHost: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>RCON Port</Label>
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={editingServer.rconPort}
                    onChange={e => {
                      const val = parseInt(e.target.value)
                      if (!isNaN(val)) setEditingServer({ ...editingServer, rconPort: Math.min(65535, Math.max(1, val)) })
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>RCON Password</Label>
                  <Input
                    type="password"
                    value={editingServer.rconPassword}
                    onChange={e => setEditingServer({ ...editingServer, rconPassword: e.target.value })}
                  />
                </div>
                {!editingServer.isRemote && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    Admin Password
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[240px]">
                        <p className="text-xs">Server admin password passed as -adminpassword launch argument. Takes effect on next server start.</p>
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input
                    type="password"
                    value={editingServer.adminPassword || ''}
                    onChange={e => setEditingServer({ ...editingServer, adminPassword: e.target.value })}
                    placeholder="Set admin password"
                  />
                </div>
                )}
              </div>

              <div className={editingServer.isRemote ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 sm:grid-cols-3 gap-4"}>
                <div className="space-y-2">
                  <Label>Game Port</Label>
                  <Input
                    type="number"
                    value={editingServer.serverPort}
                    onChange={e => setEditingServer({ ...editingServer, serverPort: parseInt(e.target.value) || 16261 })}
                  />
                </div>
                {!editingServer.isRemote && (
                <>
                <div className="space-y-2">
                  <Label>Min Memory (GB)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={64}
                    value={editingServer.minMemory}
                    onChange={e => setEditingServer({ ...editingServer, minMemory: Math.max(1, parseInt(e.target.value) || 2) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Memory (GB)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={64}
                    value={editingServer.maxMemory}
                    onChange={e => setEditingServer({ ...editingServer, maxMemory: Math.max(1, parseInt(e.target.value) || 4) })}
                  />
                </div>
                </>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingServer(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              <Check className="w-4 h-4 mr-2" /> {savingEdit ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteServer} onOpenChange={(open) => { if (!open && !deleting) { setDeleteServer(null); setDeleteFiles(false); setDeleteContainer(false); setDeleteBaseFiles(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Server from Panel?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>This will remove "{deleteServer?.name}" from the panel.</p>

                {deleteServer?.provider === 'docker-managed' ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/50">
                      <Checkbox
                        id="deleteContainer"
                        checked={deleteContainer}
                        onCheckedChange={(checked) => setDeleteContainer(checked === true)}
                        disabled={deleting}
                        className="mt-1"
                      />
                      <label htmlFor="deleteContainer" className="text-sm cursor-pointer">
                        <span className="font-medium text-destructive">Delete container &amp; server data</span>
                        <p className="text-muted-foreground mt-1">
                          Stops the container and permanently deletes this server's saves, config, and mods.
                        </p>
                      </label>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/50">
                      <Checkbox
                        id="deleteBaseFiles"
                        checked={deleteBaseFiles}
                        onCheckedChange={(checked) => setDeleteBaseFiles(checked === true)}
                        disabled={deleting}
                        className="mt-1"
                      />
                      <label htmlFor="deleteBaseFiles" className="text-sm cursor-pointer">
                        <span className="font-medium text-destructive">Delete base game files</span>
                        <p className="text-muted-foreground mt-1">
                          Removes the shared PZ server installation (~3 GB).
                          {(() => {
                            const otherManaged = servers.filter(
                              s => s.provider === 'docker-managed' && s.id !== deleteServer?.id
                            )
                            return otherManaged.length > 0 ? (
                              <span className="block mt-1 text-destructive font-medium">
                                ⚠ {otherManaged.length} other managed server{otherManaged.length > 1 ? 's' : ''} ({otherManaged.map(s => s.name).join(', ')}) will break!
                              </span>
                            ) : null
                          })()}
                        </p>
                      </label>
                    </div>
                  </div>
                ) : deleteServer?.installPath ? (
                  <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/50">
                    <Checkbox
                      id="deleteFiles"
                      checked={deleteFiles}
                      onCheckedChange={(checked) => setDeleteFiles(checked === true)}
                      disabled={deleting}
                      className="mt-1"
                    />
                    <label htmlFor="deleteFiles" className="text-sm cursor-pointer">
                      <span className="font-medium text-destructive">Also delete server files</span>
                      <p className="text-muted-foreground mt-1">
                        Permanently delete all files in:<br />
                        <code className="text-xs bg-background px-1 rounded">{deleteServer?.installPath}</code>
                      </p>
                    </label>
                  </div>
                ) : null}

                {!deleteFiles && !deleteContainer && !deleteBaseFiles && !deleting && (
                  <p className="text-sm text-muted-foreground">
                    {deleteServer?.provider === 'docker-managed'
                      ? 'Container, data, and game files will be kept — you can re-add this server later.'
                      : 'Server files will NOT be deleted — you can add this server back later.'}
                  </p>
                )}

                {deleting && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{deleteContainer || deleteFiles || deleteBaseFiles ? 'Deleting...' : 'Removing server...'}</span>
                    </div>
                    <Progress value={deleteProgress} className="h-1.5" />
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              onClick={handleDeleteServer}
              disabled={deleting}
              className={(deleteContainer || deleteFiles || deleteBaseFiles) ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {deleting ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Removing...</>
              ) : (deleteContainer || deleteFiles || deleteBaseFiles) ? 'Delete' : 'Remove from Panel'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Steam Update/Verify Dialog */}
      <Dialog open={!!steamOperation} onOpenChange={(open) => !open && !steamRunning && setSteamOperation(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {steamOperation?.type === 'verify' ? (
                <><ShieldCheck className="w-5 h-5" /> Verify Game Files</>
              ) : (
                <><RefreshCw className="w-5 h-5" /> Update Server</>
              )}
            </DialogTitle>
            <DialogDescription>
              {steamOperation?.type === 'verify'
                ? 'Check and repair game files using SteamCMD'
                : 'Download the latest version using SteamCMD'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>SteamCMD Path *</Label>
              <Input
                value={steamcmdPath}
                onChange={e => setSteamcmdPath(e.target.value)}
                placeholder="Path to SteamCMD folder"
                className="font-mono text-sm"
                disabled={steamRunning}
              />
              <p className="text-xs text-muted-foreground">
                Folder containing steamcmd
              </p>
            </div>

            <div className="space-y-2">
              <Label>Server Install Path</Label>
              <Input
                value={getInstallFolder(steamOperation?.server.installPath)}
                disabled
                className="font-mono text-sm bg-muted"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={steamRunning || clearingInstall}
                onClick={() => setConfirmClearInstall(true)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Clear Installation Folder
              </Button>
              <p className="text-xs text-muted-foreground">
                Deletes everything in the install path so you can reinstall from
                scratch. Use this if SteamCMD updates keep failing (stuck or
                corrupted download state) instead of fixing it manually.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Steam Branch {loadingBranches && <Loader2 className="inline-block w-3 h-3 ml-1 animate-spin" />}</Label>
              <Select
                value={steamOperation?.branch || 'public'}
                onValueChange={(value) => steamOperation && setSteamOperation({ ...steamOperation, branch: value })}
                disabled={steamRunning || loadingBranches}
              >
                <SelectTrigger className="w-full text-foreground">
                  {(() => {
                    const current = availableBranches.find(b => b.name === steamOperation?.branch)
                    if (loadingBranches) return <span className="text-muted-foreground">Loading branches...</span>
                    if (!current) return <span className="text-muted-foreground">Select branch</span>
                    return (
                      <span className="flex items-center gap-2">
                        <span className="capitalize">{current.name === 'public' ? 'Public (Stable)' : current.name}</span>
                        {(() => {
                          const sb = (steamOperation?.server.branch || '').trim().toLowerCase()
                          const ib = (updateInfo?.installed?.branch || '').trim().toLowerCase()
                          const isCurrent = current.name === ib || current.name === sb
                          return isCurrent ? (
                            <span className="rounded border border-border/60 px-1 py-px font-mono text-[10px] uppercase tracking-wider text-muted-foreground">current</span>
                          ) : null
                        })()}
                      </span>
                    )
                  })()}
                </SelectTrigger>
                <SelectContent>
                  {availableBranches.map((b) => (
                    <SelectItem key={b.name} value={b.name}>
                      <div className="flex flex-col">
                        <span className="capitalize">{b.name === 'public' ? 'Public (Stable)' : b.name}</span>
                        {b.description && <span className="text-xs text-muted-foreground">{b.description}</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const selected = availableBranches.find(b => b.name === steamOperation?.branch)
                  if (!selected) return 'Select the Steam branch to download from'
                  const details = [selected.description]
                  if (selected.buildId) details.push(`Build ${selected.buildId}`)
                  if (selected.timeUpdated) details.push(`Updated ${new Date(selected.timeUpdated).toLocaleString()}`)
                  return details.join(' - ')
                })()}
              </p>
            </div>

            {steamLogs.length > 0 && (
              <div className="space-y-2">
                <Label>Progress</Label>
                <div className="h-48 overflow-y-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs text-foreground">
                  {steamLogs.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSteamOperation(null)}
              disabled={steamRunning}
            >
              {steamRunning ? 'Running...' : steamCompleted ? 'Close' : 'Cancel'}
            </Button>
            {!steamCompleted && (
              <Button
                onClick={handleStartSteamOperation}
                disabled={steamRunning || !steamcmdPath.trim()}
              >
                {steamRunning ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running...</>
                ) : steamOperation?.type === 'verify' ? (
                  <><ShieldCheck className="w-4 h-4 mr-2" /> Start Verify</>
                ) : (
                  <><RefreshCw className="w-4 h-4 mr-2" /> Start Update</>
                )}
              </Button>
            )}
            {steamCompleted === 'success' && (
              <Button
                variant="default"
                onClick={() => setSteamOperation(null)}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" /> Done
              </Button>
            )}
            {steamCompleted === 'error' && (
              <Button
                onClick={() => { setSteamCompleted(null); handleStartSteamOperation(); }}
                disabled={!steamcmdPath.trim()}
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Retry
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Installation Folder confirmation */}
      <AlertDialog open={confirmClearInstall} onOpenChange={(open) => !open && !clearingInstall && setConfirmClearInstall(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Installation Folder?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes everything in{' '}
              <code className="text-xs bg-background px-1 rounded">
                {getInstallFolder(steamOperation?.server.installPath)}
              </code>
              {' '}— including the game files, SteamCMD's download state, and any
              mods installed there. Use this to recover from a SteamCMD update
              that keeps failing (corrupted or stuck installation). You'll need
              to run Start Update again afterward to reinstall from scratch.
              This does not affect your save data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearingInstall}>Cancel</AlertDialogCancel>
            <Button
              onClick={handleClearInstallFolder}
              disabled={clearingInstall}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearingInstall ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Clearing...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" />Clear Folder</>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unified Add Server flow — replaces the old per-mode Add dialog */}
      <AddServerFlow
        mode="dialog"
        open={showAddFlow}
        onClose={() => setShowAddFlow(false)}
        onComplete={() => {
          setShowAddFlow(false)
          fetchServers()
          fetchServerStatuses()
        }}
      />
    </div>
  )
}
