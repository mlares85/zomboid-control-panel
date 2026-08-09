import { useCallback, useEffect, useState } from 'react'
import { serversApi, serverApi, playersApi, backupApi, dockerApi, ServerInstance, ComposedServerStatus, ContainerStats } from '@/lib/api'
import { reportClientWarning } from '@/lib/client-errors'
import { ServerCard, ServerCardStats } from './ServerCard'

type HostStatuses = Record<string, { running: boolean }>
type ContainerStatsMap = Record<string, ContainerStats>

// Live stats (players/uptime/last backup size) only exist for the currently
// active server — the other cards only carry the host-status pill, matching
// what ServerStatusBadge already documents for non-selected servers.
async function fetchActiveStats(active: ServerInstance): Promise<ServerCardStats | null> {
  const [statusRes, playersRes, backupRes] = await Promise.allSettled([
    serverApi.getStatus(),
    playersApi.getPlayers(),
    active.isRemote ? Promise.resolve(null) : backupApi.getStatus(),
  ])
  const status = statusRes.status === 'fulfilled' ? statusRes.value as { uptime?: number } : null
  const players = playersRes.status === 'fulfilled' ? (playersRes.value as { players?: unknown[] }).players : null
  const backup = backupRes.status === 'fulfilled' ? backupRes.value as { lastBackup?: { size: number } | null } | null : null
  return {
    players: players?.length ?? 0,
    uptimeSeconds: status?.uptime ?? 0,
    lastBackupSize: backup?.lastBackup?.size ?? null,
  }
}

// GET /api/docker/stats keys its map by both container id and bare name (see
// server/routes/docker.js) — a server profile may have stored either, so
// check both before giving up.
function lookupContainerStats(server: ServerInstance, map: ContainerStatsMap): ContainerStats | null {
  if (server.dockerContainerId && map[server.dockerContainerId]) return map[server.dockerContainerId]
  if (server.dockerContainerName && map[server.dockerContainerName]) return map[server.dockerContainerName]
  return null
}

interface ServerCardsProps {
  /** Called once a card's server has been activated — the parent can use this to drill into a detail view. */
  onDrillIn?: (serverId: string | number) => void
}

export function ServerCards({ onDrillIn }: ServerCardsProps) {
  const [servers, setServers] = useState<ServerInstance[]>([])
  const [hostStatuses, setHostStatuses] = useState<HostStatuses>({})
  const [activeStatus, setActiveStatus] = useState<ComposedServerStatus | null>(null)
  const [activeStats, setActiveStats] = useState<ServerCardStats | null>(null)
  const [containerStats, setContainerStats] = useState<ContainerStatsMap>({})

  const fetchAll = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    try {
      const [{ servers: list }, statusData, statsMap] = await Promise.all([
        serversApi.getAll(),
        serversApi.getStatus(),
        dockerApi.getAllStats().catch(() => ({})),
      ])
      setServers(list)
      setContainerStats(statsMap)
      const next: HostStatuses = {}
      for (const s of statusData.servers) next[String(s.id)] = { running: !!s.running }
      setHostStatuses(next)

      const active = list.find(s => s.isActive)
      if (!active) { setActiveStatus(null); setActiveStats(null); return }
      const [composed, stats] = await Promise.all([
        serversApi.getComposedStatus().catch(() => null),
        fetchActiveStats(active),
      ])
      setActiveStatus(composed)
      setActiveStats(stats)
    } catch (error) {
      reportClientWarning('Failed to fetch server cards.', error)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 10000)
    return () => clearInterval(interval)
  }, [fetchAll])

  if (servers.length === 0) return null

  return (
    <section aria-label="Servers" className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {servers.map(server => (
        <ServerCard
          key={server.id}
          server={server}
          isRunning={hostStatuses[String(server.id)]?.running ?? false}
          activeStatus={server.isActive ? activeStatus : null}
          stats={server.isActive ? activeStats : null}
          containerStats={lookupContainerStats(server, containerStats)}
          onChanged={fetchAll}
          onDrillIn={onDrillIn}
        />
      ))}
    </section>
  )
}
