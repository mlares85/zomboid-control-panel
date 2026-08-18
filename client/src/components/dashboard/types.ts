// Types shared across Dashboard components.

export interface PlayerActivity {
  id: number
  player_name: string
  action: string
  details: string | null
  logged_at: string
}

export interface BridgeStatus {
  configured: boolean
  isRunning: boolean
  modConnected: boolean
  modStatus: {
    alive: boolean
    version?: string
    serverName?: string
    playerCount?: number
  } | null
}

export interface ServerStatus {
  running: boolean
  startTime: string | null
  uptime: number
  serverPath: string
  configured: boolean
  publicIp?: string
  localIp?: string
  port?: number
  rcon: { host: string; port: number; connected: boolean }
}

export interface Player { name: string; online: boolean }

export interface PerformancePoint {
  time: string
  timestamp?: string
  playerCount: number
  memoryMB: number
  pzMemMB?: number
  cpuPercent?: number
  hostMemUsedGB?: number
  hostMemTotalGB?: number
  hostDiskUsedGB?: number
  hostDiskTotalGB?: number
}

export type DashboardView = 'cards' | 'classic'

export interface ConfirmAction {
  title: string
  description: string
  action: () => Promise<unknown>
  variant?: 'destructive' | 'warning'
}

export interface WipePreview {
  totalFiles: number
  totalSize: number
  preview: Record<string, { files: number; size: number }>
}

export interface MaintenanceState {
  lastBackup: { name: string; size: number; created: string } | null
  backupCount: number
  modUpdatesAvailable: number
  modsTracked: number
  scheduledTasksCount: number
  nextRun: { label: string; at: string } | null
  errorCount: number | null
  schedulerLoaded: boolean
}

export interface PlayerPresence {
  name: string
  since?: string
}
