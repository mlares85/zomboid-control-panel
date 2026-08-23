import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, ListChecks, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { serversApi, rconApi, panelBridgeApi, backupApi } from '@/lib/api'

const DISMISSED_KEY = 'pz-setup-checklist-dismissed-v1'

interface ChecklistItem {
  id: string
  label: string
  done: boolean
  to?: string
}

async function loadItems(): Promise<ChecklistItem[]> {
  const [servers, rcon, bridge, backups] = await Promise.allSettled([
    serversApi.getAll(),
    rconApi.getStatus() as Promise<{ connected?: boolean }>,
    panelBridgeApi.getStatus(),
    backupApi.listBackups(),
  ])

  const serverCount = servers.status === 'fulfilled' ? servers.value.servers.length : 0
  const rconConnected = rcon.status === 'fulfilled' ? Boolean(rcon.value?.connected) : false
  const bridgeLive =
    bridge.status === 'fulfilled' ? Boolean(bridge.value.isRunning || bridge.value.modStatus?.alive) : false
  const backupCount = backups.status === 'fulfilled' ? backups.value.backups.length : 0

  return [
    { id: 'account', label: 'Admin account', done: true },
    { id: 'server', label: 'Server connected', done: serverCount > 0, to: '/servers' },
    { id: 'rcon', label: 'RCON verified', done: rconConnected, to: '/console' },
    { id: 'bridge', label: 'PanelBridge live', done: bridgeLive, to: '/settings' },
    { id: 'backup', label: 'First backup', done: backupCount > 0, to: '/backups' },
  ]
}

/**
 * Persistent dashboard card for anyone who chose "Skip for now" in the
 * onboarding wizard. Always dismissable — users shouldn't be forced to
 * complete every step before hiding the card.
 */
export function SetupChecklist() {
  const [items, setItems] = useState<ChecklistItem[] | null>(null)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (dismissed) return
    let cancelled = false
    loadItems().then((result) => {
      if (!cancelled) setItems(result)
    })
    return () => {
      cancelled = true
    }
  }, [dismissed])

  if (dismissed || !items) return null
  const allDone = items.every((i) => i.done)
  if (allDone) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, 'true')
    } catch {
      /* ignore storage failures */
    }
    setDismissed(true)
  }

  return (
    <Card className="border-primary/25 bg-primary/[0.03]">
      <CardContent className="flex items-start gap-3 py-4">
        <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Finish setting up</p>
          <ul className="mt-2 space-y-1.5">
            {items.map((item) => {
              const row = (
                <span className="flex items-center gap-2 text-sm">
                  {item.done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className={item.done ? 'text-muted-foreground line-through' : 'text-foreground/90'}>{item.label}</span>
                </span>
              )
              return (
                <li key={item.id}>
                  {!item.done && item.to ? (
                    <Link to={item.to} className="inline-flex hover:underline">
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              )
            })}
          </ul>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          aria-label="Dismiss setup checklist"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </CardContent>
    </Card>
  )
}
