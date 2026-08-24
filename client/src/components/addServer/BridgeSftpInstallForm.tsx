import { useState } from 'react'
import { Loader2, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { panelBridgeApi } from '@/lib/api'

interface BridgeSftpInstallFormProps {
  serverId: string | number
  onInstalled: (result: { success: boolean; message?: string }) => void
}

interface SftpFormState {
  host: string
  port: string
  username: string
  password: string
  installPath: string
}

const INITIAL_STATE: SftpFormState = {
  host: '',
  port: '22',
  username: '',
  password: '',
  installPath: '',
}

/** SFTP credentials form used to install the PanelBridge mod onto a remote-sftp server during onboarding. */
export function BridgeSftpInstallForm({ serverId, onInstalled }: BridgeSftpInstallFormProps) {
  const [form, setForm] = useState<SftpFormState>(INITIAL_STATE)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (patch: Partial<SftpFormState>) => setForm((prev) => ({ ...prev, ...patch }))

  const canSubmit = form.host.trim() && form.username.trim() && form.password && form.installPath.trim()

  const handleInstall = async () => {
    setInstalling(true)
    setError(null)
    try {
      const result = await panelBridgeApi.installSftp({
        serverId,
        host: form.host.trim(),
        port: form.port.trim() || '22',
        username: form.username.trim(),
        password: form.password,
        installPath: form.installPath.trim(),
      })
      onInstalled(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not install PanelBridge over SFTP')
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/50 bg-muted/15 p-3">
      <p className="text-xs text-muted-foreground">
        This server is reachable over SFTP. Enter credentials to copy the PanelBridge mod onto it.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Host</Label>
          <Input value={form.host} onChange={(e) => set({ host: e.target.value })} placeholder="192.168.1.10" className="h-8 font-mono text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Port</Label>
          <Input value={form.port} onChange={(e) => set({ port: e.target.value })} placeholder="22" className="h-8 font-mono text-xs" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Username</Label>
        <Input value={form.username} onChange={(e) => set({ username: e.target.value })} className="h-8 text-xs" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Password</Label>
        <Input type="password" value={form.password} onChange={(e) => set({ password: e.target.value })} className="h-8 text-xs" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Install path</Label>
        <Input
          value={form.installPath}
          onChange={(e) => set({ installPath: e.target.value })}
          placeholder="/home/pzuser/Zomboid/Lua"
          className="h-8 font-mono text-xs"
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button size="sm" onClick={handleInstall} disabled={!canSubmit || installing} className="w-full">
        {installing ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Installing…</> : <><UploadCloud className="mr-2 h-3.5 w-3.5" /> Install over SFTP</>}
      </Button>
    </div>
  )
}
