import { useEffect, useState } from 'react'

/** Max conflicting files listed per pair before the "show all" toggle appears. */
export const CONFLICT_FILE_LIMIT = 12

export interface TrackedMod {
  id: number
  workshop_id: string
  name: string
  last_updated: string
  last_checked: string | null
  update_available: number
  created_at: string
  active?: boolean
}

export interface ModStatus {
  totalModsTracked: number
  totalModsInWorkshop: number
  updatesAvailable: number
  lastCheck: string | null
  lastUpdateDetected: string | null
  autoRestartEnabled: boolean
  running: boolean
  workshopAcfConfigured: boolean
  workshopAcfPath: string | null
  checkInterval: number
  modsNeedingUpdate: Array<{
    workshopId: string
    name: string
    localTimestamp: string
    latestTimestamp: string
  }>
  restartWarningMinutes: number
  delayIfPlayersOnline: boolean
  maxDelayMinutes: number
  pendingRestart: boolean
}

export type ModEntry = { id: string; name: string; enabled: boolean; require?: string[] }
export type WsGroup = { wsId: string; mods: ModEntry[]; allEnabled: boolean; someEnabled: boolean }

export type DepSearchHit = {
  workshopId: string
  modId?: string
  modName: string
  description?: string
  subscriberCount?: number
  source: 'local' | 'steam'
  isDownloaded: boolean
  matchedVariant?: string
  relevance?: number
  matchType?: string
}

export type DepSearchState = {
  loading: boolean
  results: DepSearchHit[]
  error: string | null
  searchUrl: string | null
  variantsTried?: string[]
  steamSearchEnabled?: boolean
}

// ── Safe Update (SafeModUpdateButton / ModUpdateProgress) ──
export type SafeUpdateStepKey = 'backup' | 'update' | 'warning' | 'restart' | 'verify'
export type SafeUpdateStepStatus = 'pending' | 'in_progress' | 'success' | 'failed'

export interface SafeUpdateStepEvent {
  step: SafeUpdateStepKey
  status: SafeUpdateStepStatus
  detail: string | null
}

export type SafeUpdateStepStates = Record<SafeUpdateStepKey, SafeUpdateStepEvent>

export const SAFE_UPDATE_STEP_ORDER: SafeUpdateStepKey[] = [
  'backup',
  'update',
  'warning',
  'restart',
  'verify',
]

// Rough nominal durations in seconds — only used for the "estimated time
// remaining" readout. Backup size and server boot time both vary a lot, so
// this is a ballpark, not a promise.
const SAFE_UPDATE_STEP_ESTIMATE_SECONDS: Record<SafeUpdateStepKey, number> = {
  backup: 60,
  update: 10,
  warning: 30,
  restart: 180,
  verify: 10,
}

export function initialStepStates(): SafeUpdateStepStates {
  return SAFE_UPDATE_STEP_ORDER.reduce((states, step) => {
    states[step] = { step, status: 'pending', detail: null }
    return states
  }, {} as SafeUpdateStepStates)
}

export function estimateSecondsRemaining(
  steps: SafeUpdateStepStates,
  warningSeconds: number,
): number {
  return SAFE_UPDATE_STEP_ORDER.reduce((total, step) => {
    const state = steps[step]
    if (state.status === 'success' || state.status === 'failed') return total
    const estimate = step === 'warning' ? warningSeconds : SAFE_UPDATE_STEP_ESTIMATE_SECONDS[step]
    return total + estimate
  }, 0)
}

/** useState wrapper that persists the value to localStorage under a stable key. */
export function useLocalStorageState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return defaultValue
      return JSON.parse(raw) as T
    } catch { return defaultValue }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota or disabled — ignore */ }
  }, [key, value])
  return [value, setValue]
}
