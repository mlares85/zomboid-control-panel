import { ApiError } from './api'

export function getUserErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const message = error.message?.trim()
    if (message && message.toLowerCase() !== 'unknown error') {
      return message
    }
    return fallback
  }

  if (error instanceof Error) {
    const message = error.message?.trim()
    if (message && message.toLowerCase() !== 'unknown error') {
      return message
    }
    return fallback
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const candidate = (error as { message?: unknown }).message
    if (typeof candidate === 'string' && candidate.trim() && candidate.toLowerCase() !== 'unknown error') {
      return candidate.trim()
    }
  }

  return fallback
}

// Backend config/connection errors (bridge not running, RCON not connected,
// server not configured, ...) attach a `fixUrl` pointing at the Settings
// page that fixes them. `error.data` is the full parsed JSON body — see
// ApiError in api.ts.
export function getErrorFixUrl(error: unknown): string | undefined {
  if (!(error instanceof ApiError) || !error.data || typeof error.data !== 'object') {
    return undefined
  }
  const fixUrl = (error.data as { fixUrl?: unknown }).fixUrl
  return typeof fixUrl === 'string' && fixUrl.trim() ? fixUrl : undefined
}
