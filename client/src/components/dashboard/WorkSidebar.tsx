import { Link } from 'react-router-dom'
import { Archive, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { backupApi, type ServerInstance } from '@/lib/api'
import type { WorkItem } from './DashboardVerdict'
import { WorkList } from './DashboardVerdict'
import { ConnLine } from './helpers'
import type { BridgeStatus, ServerStatus } from './types'

interface Props {
  workItems: WorkItem[]
  online: boolean
  status: ServerStatus | null
  bridgeStatus: BridgeStatus | null
  activeServer: ServerInstance | null
  lastUpdated: Date | null
  loading: string | null
  hasServer: boolean
  autoStartServer: boolean
  onAction: (action: string, fn: () => Promise<unknown>) => void
  onRefresh: () => void
  onRefreshMaintenance: () => void
  onAutoStartChange: (checked: boolean) => void
  onOpenWipe: () => void
}

export function WorkSidebar({
  workItems, online, status, bridgeStatus, activeServer, lastUpdated, loading,
  hasServer, autoStartServer, onAction, onRefresh, onRefreshMaintenance,
  onAutoStartChange, onOpenWipe,
}: Props) {
  return (
    <aside className="grid content-start gap-6">
      <section>
        <WorkList items={workItems} />
        <div className="mt-2 border-t border-border/25 px-1 pt-1">
          <ConnLine
            label={activeServer?.isRemote ? 'Host' : 'Process'}
            state={online ? 'on' : 'off'}
          />
          <ConnLine
            label="RCON"
            state={status?.rcon?.connected ? 'on' : 'off'}
            value={status?.rcon ? `${status.rcon.host}:${status.rcon.port}` : undefined}
          />
          <ConnLine
            label="Bridge"
            state={bridgeStatus?.modConnected ? 'on' : bridgeStatus?.isRunning ? 'wait' : 'off'}
            value={
              bridgeStatus?.modConnected && bridgeStatus.modStatus?.version
                ? `v${bridgeStatus.modStatus.version.replace(/^v/, '')}`
                : bridgeStatus?.isRunning ? 'pending' : 'offline'
            }
          />
        </div>
      </section>

      {!activeServer?.isRemote && (
        <section>
          <h3 className="px-1 pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/75">Maintenance</h3>
          <div className="space-y-1.5">
            <Button size="sm" variant="outline" className="h-7 w-full justify-start gap-2 text-xs"
              onClick={onRefresh} disabled={loading !== null}>
              <RefreshCw className={cn('h-3 w-3', loading ? 'animate-spin' : '')} />
              Refresh status
              <span className="ml-auto font-mono text-[10px] text-muted-foreground/65">
                {lastUpdated ? lastUpdated.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
            </Button>
            <Button size="sm" variant="outline" className="h-7 w-full justify-start gap-2 text-xs"
              disabled={!hasServer || loading !== null || activeServer?.isRemote}
              onClick={() => onAction('Create backup', () => backupApi.createBackup({ includeDb: true }).then(() => onRefreshMaintenance()))}>
              {loading === 'Create backup' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
              Create backup
            </Button>
            <Button size="sm" variant="outline"
              className="h-7 w-full justify-start gap-2 text-xs text-destructive hover:text-destructive"
              disabled={!hasServer || online || loading !== null || activeServer?.isRemote}
              onClick={onOpenWipe}
              title={online ? 'Stop the server before wiping' : 'Delete map / players / world state'}>
              <Trash2 className="h-3 w-3" /> Wipe server
            </Button>
            <label className="mt-1 flex cursor-pointer items-center gap-2 border-t border-border/30 px-1 pt-2">
              <Checkbox id="autoStartServer" checked={autoStartServer}
                onCheckedChange={(checked) => onAutoStartChange(checked === true)} />
              <Label htmlFor="autoStartServer" className="cursor-pointer text-[11px] text-muted-foreground">
                Auto-start on launch
              </Label>
            </label>
          </div>
        </section>
      )}

      {bridgeStatus && !bridgeStatus.configured && (
        <section className="rounded-md border border-warning/25 bg-warning/[0.04] p-3">
          <p className="text-xs font-medium text-warning/85">Bridge offline</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Advanced world controls require PanelBridge.{' '}
            <Link to="/settings" className="text-primary hover:underline">Configure bridge</Link>.
          </p>
        </section>
      )}
    </aside>
  )
}
