import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Container, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/PasswordInput'
import { RconTestConnection } from '@/components/RconTestConnection'
import { serversApi, serversDetectApi } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'
import type { WizardSelection } from './types'

interface ConfigureStepProps {
  selection: WizardSelection
  /** Drives the "install a new server" copy — Docker on macOS, SteamCMD on Windows. */
  platform?: string
  onCreated: (serverId: string | number) => void
  onBack: () => void
}

/** New-install copy for the "new" intent — what actually happens differs per platform. */
function newInstallCopy(platform?: string) {
  if (platform === 'darwin') {
    return {
      icon: Container,
      title: 'Set up a Docker container',
      description: 'The installer will configure a PZ dedicated server running in a Linux container.',
    }
  }
  if (platform === 'win32') {
    return {
      icon: Download,
      title: 'Install a new server',
      description: 'SteamCMD downloads the dedicated server files to a folder on this machine, then the installer walks you through paths, ports, and startup.',
    }
  }
  return {
    icon: Download,
    title: 'Install a new server',
    description: 'Fresh installs use the full installer — paths, ports, memory, and startup all in one guided flow.',
  }
}

interface FormState {
  name: string
  serverName: string
  installPath: string
  zomboidDataPath: string
  rconHost: string
  rconPort: number
  rconPassword: string
  serverPort: number
  isRemote: boolean
}

function initialForm(selection: WizardSelection): FormState {
  const mount = selection.mount
  return {
    name: '',
    serverName: 'servertest',
    installPath: mount?.type === 'install' ? mount.path : '',
    zomboidDataPath: mount?.type === 'data' ? mount.path : '',
    rconHost: '127.0.0.1',
    rconPort: 27015,
    rconPassword: '',
    serverPort: 16261,
    isRemote: selection.intent === 'existing' ? false : false,
  }
}

/** Auto-detect RCON settings for a detected local mount, same signature scan Servers.tsx uses. */
function useAutoDetect(selection: WizardSelection, setForm: (fn: (f: FormState) => FormState) => void) {
  const [detecting, setDetecting] = useState(false)
  useEffect(() => {
    if (selection.intent !== 'detected' || !selection.mount) return
    setDetecting(true)
    serversDetectApi
      .detect({
        dataPath: selection.mount.type === 'data' ? selection.mount.path : '',
        installPath: selection.mount.type === 'install' ? selection.mount.path : undefined,
      })
      .then((data: any) => {
        const first = data?.detectedServers?.[0]
        if (first) {
          setForm((f) => ({
            ...f,
            name: first.publicName || first.serverName,
            serverName: first.serverName,
            rconPort: first.rconPort,
            rconPassword: first.rconPassword || '',
            serverPort: first.serverPort,
            zomboidDataPath: data.dataPath || f.zomboidDataPath,
          }))
        }
      })
      .catch(() => {
        /* fall back to manual entry below */
      })
      .finally(() => setDetecting(false))
  }, [selection, setForm])
  return detecting
}

export function ConfigureStep({ selection, platform, onCreated, onBack }: ConfigureStepProps) {
  const [form, setForm] = useState<FormState>(() => initialForm(selection))
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const navigate = useNavigate()
  const detecting = useAutoDetect(selection, setForm)

  if (selection.intent === 'new') {
    const { icon: Icon, title, description } = newInstallCopy(platform)
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        <Button className="w-full onboarding-cta" onClick={() => navigate('/server-setup')}>
          <Download className="mr-2 h-4 w-4" /> Open the installer
        </Button>
        <Button variant="ghost" className="w-full" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      </div>
    )
  }

  const canSubmit = form.rconPassword.trim() && (form.isRemote ? form.rconHost.trim() : true)

  const handleSubmit = async () => {
    setSaving(true)
    try {
      const result = await serversApi.create({
        name: form.name || form.serverName,
        serverName: form.serverName,
        installPath: form.installPath,
        zomboidDataPath: form.zomboidDataPath,
        rconHost: form.rconHost,
        rconPort: form.rconPort,
        rconPassword: form.rconPassword,
        serverPort: form.serverPort,
        isRemote: form.isRemote,
      })
      if (result.server?.id) {
        await serversApi.activate(result.server.id)
        onCreated(result.server.id)
      }
    } catch (err) {
      toast({
        title: 'Could not add server',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">
          {selection.intent === 'detected' ? 'Confirm the detected server' : 'Connect a server'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {detecting ? 'Reading its configuration…' : 'Fill in RCON access so the panel can control it.'}
        </p>
      </div>

      {selection.intent === 'existing' && (
        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
          <input
            id="isRemote"
            type="checkbox"
            checked={form.isRemote}
            onChange={(e) => setForm((f) => ({ ...f, isRemote: e.target.checked }))}
            className="h-4 w-4"
          />
          <Label htmlFor="isRemote" className="cursor-pointer text-sm font-normal">
            This server runs on another machine (RCON only)
          </Label>
        </div>
      )}

      <div className="space-y-2">
        <Label>Display Name</Label>
        <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="My PZ Server" maxLength={100} />
      </div>

      {form.isRemote && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>RCON Host *</Label>
            <Input value={form.rconHost} onChange={(e) => setForm((f) => ({ ...f, rconHost: e.target.value }))} className="font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label>RCON Port</Label>
            <Input type="number" value={form.rconPort} onChange={(e) => setForm((f) => ({ ...f, rconPort: parseInt(e.target.value) || 27015 }))} />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>RCON Password *</Label>
        <PasswordInput value={form.rconPassword} onChange={(v) => setForm((f) => ({ ...f, rconPassword: v }))} placeholder="RCON password" />
        <RconTestConnection host={form.rconHost} port={form.rconPort} password={form.rconPassword} disabled={!form.rconPassword} />
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button className="flex-1 onboarding-cta" onClick={handleSubmit} disabled={!canSubmit || saving}>
          {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding…</> : 'Add server & continue'}
        </Button>
      </div>
    </div>
  )
}
