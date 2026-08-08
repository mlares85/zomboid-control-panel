import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Loader2, HardDrive, Database, ArrowRight, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PasswordInput } from '@/components/PasswordInput'
import { RconTestConnection } from '@/components/RconTestConnection'
import { useToast } from '@/components/ui/use-toast'
import { serversApi, serversDetectApi, type DiscoveredMount, type ServerInstance } from '@/lib/api'

interface DetectedServerInfo {
  serverName: string
  rconPort: number
  rconPassword: string
  serverPort: number
  publicName: string
  hasRcon: boolean
}

interface DiscoverySetupProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mount: DiscoveredMount | null
  onCreated?: (server: ServerInstance) => void
}

// Dialog opened from "Connect" on the mount-discovery banner. Re-probes the
// discovered mount for per-server RCON settings (the discover-mounts scan
// itself only reports paths + server names), lets the user pick which
// server config to use when several exist, and turns it into a full
// profile via create-from-discovery.
export function DiscoverySetup({ open, onOpenChange, mount, onCreated }: DiscoverySetupProps) {
  const [detecting, setDetecting] = useState(false)
  const [servers, setServers] = useState<DetectedServerInfo[]>([])
  const [selectedName, setSelectedName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [rconPassword, setRconPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [created, setCreated] = useState<ServerInstance | null>(null)
  const { toast } = useToast()
  const navigate = useNavigate()

  const selected = servers.find((s) => s.serverName === selectedName) || null

  useEffect(() => {
    if (!open || !mount) return
    setCreated(null)
    setCreateError(null)
    setServers([])
    setSelectedName('')
    setRconPassword('')

    let cancelled = false
    setDetecting(true)
    serversDetectApi
      .detect({ dataPath: mount.dataPath || '', installPath: mount.installPath })
      .then((data) => {
        if (cancelled) return
        const list = (data.detectedServers as DetectedServerInfo[] | undefined) || []
        setServers(list)
        const first = list[0]
        if (first) {
          setSelectedName(first.serverName)
          setDisplayName(first.publicName || first.serverName)
          setRconPassword(first.rconPassword)
        }
      })
      .catch(() => {
        if (cancelled) return
        // Fall back to the bare server names the scan already found.
        setServers(
          mount.serverNames.map((name) => ({
            serverName: name,
            rconPort: 27015,
            rconPassword: '',
            serverPort: 16261,
            publicName: name,
            hasRcon: false,
          })),
        )
      })
      .finally(() => !cancelled && setDetecting(false))

    return () => {
      cancelled = true
    }
  }, [open, mount])

  const selectServer = (name: string) => {
    setSelectedName(name)
    const s = servers.find((x) => x.serverName === name)
    if (s) {
      setDisplayName(s.publicName || s.serverName)
      setRconPassword(s.rconPassword)
    }
  }

  const handleCreate = async () => {
    if (!mount || !selected) return
    setCreating(true)
    setCreateError(null)
    try {
      const result = await serversApi.createFromDiscovery({
        installPath: mount.installPath,
        dataPath: mount.dataPath || '',
        serverName: selected.serverName,
        name: displayName || undefined,
      })
      let server = result.server
      // If the user edited the password shown from the INI, push that
      // correction into the profile we just created.
      if (rconPassword && rconPassword !== selected.rconPassword) {
        const updated = await serversApi.update(server.id, { rconPassword })
        server = updated.server
      }
      await serversApi.activate(server.id)
      setCreated(server)
      onCreated?.(server)
      toast({ title: 'Server Connected', description: `"${server.name}" added to panel` })
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create server')
    } finally {
      setCreating(false)
    }
  }

  if (!mount) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect Discovered Server</DialogTitle>
          <DialogDescription>
            PZ server files were found at this mount. Review the settings below and connect.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-primary">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span className="text-sm font-medium">Server connected!</span>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                onOpenChange(false)
                navigate('/')
              }}
            >
              Go to Dashboard <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div className="rounded-md border border-border/40 bg-muted/15 divide-y divide-border/30">
                <div className="flex items-start gap-2.5 px-3 py-2">
                  <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Install Path</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-foreground/85">{mount.installPath}</p>
                  </div>
                </div>
                {mount.dataPath && (
                  <div className="flex items-start gap-2.5 px-3 py-2">
                    <Database className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Data Path</p>
                      <p className="mt-0.5 truncate font-mono text-xs text-foreground/85">{mount.dataPath}</p>
                    </div>
                  </div>
                )}
              </div>

              {detecting ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : servers.length === 0 ? (
                <Alert className="border-warning/40 bg-warning/10">
                  <AlertCircle className="h-4 w-4 text-warning" />
                  <AlertTitle className="text-warning">No server config found</AlertTitle>
                  <AlertDescription>Run the server once to create the INI file, then rescan.</AlertDescription>
                </Alert>
              ) : (
                <>
                  {servers.length > 1 && (
                    <div className="space-y-2">
                      <Label>Server Configuration</Label>
                      <Select value={selectedName} onValueChange={selectServer}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a server..." />
                        </SelectTrigger>
                        <SelectContent>
                          {servers.map((s) => (
                            <SelectItem key={s.serverName} value={s.serverName}>
                              {s.publicName || s.serverName} ({s.serverName}.ini)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Display Name</Label>
                    <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={100} />
                  </div>

                  {selected && (
                    <>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Game Port:</span>
                          <p className="font-mono">{selected.serverPort}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">RCON Port:</span>
                          <p className="font-mono">{selected.rconPort}</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>RCON Password</Label>
                        <PasswordInput
                          value={rconPassword}
                          onChange={setRconPassword}
                          placeholder="Read from the server's INI file"
                          label="RCON password"
                        />
                        {!selected.hasRcon && !rconPassword ? (
                          <p className="text-xs text-warning">
                            No RCON password found in {selected.serverName}.ini — set one there, or enter it here.
                          </p>
                        ) : (
                          <p className="flex items-center gap-1 text-xs text-primary">
                            <CheckCircle2 className="h-3 w-3" /> Password set
                          </p>
                        )}
                        <RconTestConnection host="127.0.0.1" port={selected.rconPort} password={rconPassword} />
                      </div>
                    </>
                  )}

                  {createError && (
                    <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">{createError}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating || detecting || !selected || !rconPassword.trim()}>
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...
                  </>
                ) : (
                  'Create Server'
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
