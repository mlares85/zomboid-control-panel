import { useEffect, useState } from 'react'
import { ArrowLeft, Container, Download, FolderOpen, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/PasswordInput'
import { RconTestConnection } from '@/components/RconTestConnection'
import { serversApi, serversDetectApi, type EnvironmentSnapshot } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'
import { FullInstallFlow } from './FullInstallFlow'
import { QuickSetupFlow } from './QuickSetupFlow'
import { DockerSetup } from './DockerSetup'
import type { WizardSelection } from './types'

type NewServerMode = 'select' | 'full' | 'quick' | 'docker'

interface ConfigureStepProps {
  selection: WizardSelection
  environment?: EnvironmentSnapshot | null
  onCreated: (serverId: string | number) => void
  onBack: () => void
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
    isRemote: false,
  }
}

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
      .then((data: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped detect response
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
      .catch(() => { /* fall back to manual entry */ })
      .finally(() => setDetecting(false))
  }, [selection, setForm])
  return detecting
}

const MODE_CARDS: Array<{ mode: NewServerMode; icon: typeof Download; title: string; description: string; badge?: string }> = [
  { mode: 'full', icon: Download, title: 'Fresh Install', description: 'Download server files via SteamCMD', badge: 'Suggested' },
  { mode: 'quick', icon: FolderOpen, title: 'Existing Files', description: 'Point at PZ server files you already have', badge: 'Suggested' },
  { mode: 'docker', icon: Container, title: 'Docker', description: 'Run PZ inside a managed container', badge: 'Advanced' },
]

function NewServerModePicker({ onSelect, onBack }: { onSelect: (m: NewServerMode) => void; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">How do you want to set up?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose an install method for your new server.</p>
      </div>
      <div className="grid gap-2">
        {MODE_CARDS.map(({ mode, icon: Icon, title, description, badge }) => (
          <button
            key={mode}
            type="button"
            onClick={() => onSelect(mode)}
            className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/20"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/30 text-muted-foreground">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{title}</p>
                {badge && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight ${
                    badge === 'Advanced'
                      ? 'bg-orange-500/15 text-orange-500'
                      : 'bg-primary/15 text-primary'
                  }`}>
                    {badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </button>
        ))}
      </div>
      <Button variant="outline" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>
    </div>
  )
}

export function ConfigureStep({ selection, environment, onCreated, onBack }: ConfigureStepProps) {
  const [form, setForm] = useState<FormState>(() => initialForm(selection))
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const detecting = useAutoDetect(selection, setForm)

  const [newMode, setNewMode] = useState<NewServerMode>('select')

  // Pre-fill install path from environment scan if one was discovered
  const discoveredInstallPath = environment?.discoveredMounts?.find((m) => m.type === 'install')?.path

  // ── intent = 'new': embed the install flow inline ──
  if (selection.intent === 'new') {
    if (newMode === 'select') {
      return <NewServerModePicker onSelect={setNewMode} onBack={onBack} />
    }
    if (newMode === 'docker') {
      return <DockerSetup onBack={() => setNewMode('select')} onServerCreated={onCreated} />
    }
    if (newMode === 'full') {
      return <FullInstallFlow onBack={() => setNewMode('select')} onServerCreated={onCreated} initialInstallPath={discoveredInstallPath} />
    }
    if (newMode === 'quick') {
      return <QuickSetupFlow onBack={() => setNewMode('select')} onServerCreated={onCreated} initialInstallPath={discoveredInstallPath} />
    }
  }

  // ── intent = 'detected' or 'existing': connection form ──
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
