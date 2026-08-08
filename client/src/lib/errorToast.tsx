import { getUserErrorMessage, getErrorFixUrl } from '@/lib/errorMessage'
import { FixThisAction } from '@/components/ui/fix-this-action'

// Spread into a destructive toast() call: gives the description its usual
// server-provided message, plus a "Fix this →" action button when the
// error response carried a fixUrl (bridge/RCON/server-not-configured, etc).
// `toast({ title: 'Error', ...errorToastContent(error, 'Failed to X.'), variant: 'destructive' })`
export function errorToastContent(error: unknown, fallback: string) {
  const fixUrl = getErrorFixUrl(error)
  return {
    description: getUserErrorMessage(error, fallback),
    action: fixUrl ? <FixThisAction fixUrl={fixUrl} /> : undefined,
  }
}
