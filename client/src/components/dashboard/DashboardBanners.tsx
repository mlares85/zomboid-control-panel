import { Link } from 'react-router-dom'
import { AlertCircle, AlertTriangle, Download, RefreshCw, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PanelUpdateStatus } from '@/lib/api'
import type { ServerStatus } from './types'

interface UpdateBannerProps {
  panelUpdate: PanelUpdateStatus
  dismissedVersion: string | null
  onDismiss: (version: string) => void
}

export function PanelUpdateBanner({ panelUpdate, dismissedVersion, onDismiss }: UpdateBannerProps) {
  if (!panelUpdate.updateAvailable) return null
  const latest = panelUpdate.latestVersion
  if (latest && latest === panelUpdate.currentVersion) return null
  if (latest && dismissedVersion === latest) return null

  const isStaged = !!panelUpdate.stagedUpdate && (!latest || panelUpdate.stagedUpdate.version === latest)
  const lastFailed = panelUpdate.lastApplyResult?.status === 'failed'
    && (!latest || panelUpdate.lastApplyResult.pendingVersion === latest)
  const ctaLabel = isStaged ? 'Apply update' : 'View update'
  const accent = lastFailed ? 'destructive' : 'primary'

  return (
    <div
      role="status"
      className={cn(
        'mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border py-2 pl-3 pr-2',
        lastFailed
          ? 'border-destructive/35 bg-destructive/[0.05] shadow-[inset_2px_0_0_hsl(var(--destructive))]'
          : 'border-primary/35 bg-primary/[0.04] shadow-[inset_2px_0_0_hsl(var(--primary))]',
      )}
    >
      <Sparkles className={cn('h-3.5 w-3.5 shrink-0', `text-${accent}`)} />
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className={cn('font-mono text-[10px] font-semibold uppercase tracking-[0.18em]', `text-${accent}`)}>
          {lastFailed ? 'Apply failed' : isStaged ? 'Update staged' : 'Panel update'}
        </span>
        <span className="min-w-0 text-xs text-muted-foreground">
          {lastFailed
            ? 'Last apply attempt failed — see Settings for diagnostics.'
            : isStaged
              ? 'Downloaded and ready. Restart the panel to apply.'
              : 'A new panel version is available.'}
        </span>
        {latest && (
          <span className="font-mono text-[11px] tabular-nums text-foreground/85">
            v{panelUpdate.currentVersion} <span className="text-muted-foreground/60">→</span> v{latest}
          </span>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 px-0 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss update notification"
          onClick={() => latest && onDismiss(latest)}
          disabled={!latest}
          title="Dismiss until next version"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
        <Link to="/settings?tab=panel">
          <Button
            size="sm"
            variant={lastFailed ? 'destructive' : 'default'}
            className="h-7 gap-1.5 px-2.5 text-xs font-semibold"
          >
            <Download className="h-3 w-3" /> {ctaLabel}
          </Button>
        </Link>
      </div>
    </div>
  )
}

export function ErrorBanner({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-destructive/40 bg-destructive/[0.05] py-2 pl-3 pr-2 shadow-[inset_2px_0_0_hsl(var(--destructive))]"
    >
      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-destructive">
          Connection error
        </span>
        <span className="min-w-0 truncate text-xs text-muted-foreground" title={error}>
          {error}. Some features may be unavailable.
        </span>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} className="ml-auto h-7 gap-1.5 px-2.5 text-xs">
        <RefreshCw className="h-3 w-3" /> Retry
      </Button>
    </div>
  )
}

export function NotConfiguredBanner({ status }: { status: ServerStatus | null }) {
  if (!status || status.configured) return null
  return (
    <Link
      to="/server-setup"
      className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-warning/40 bg-warning/[0.04] py-2 pl-3 pr-2 shadow-[inset_2px_0_0_hsl(var(--warning))] transition-colors hover:bg-warning/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-warning">
          Not configured
        </span>
        <span className="text-xs text-muted-foreground">
          Open Server Setup to add or configure a server.
        </span>
      </div>
      <span className="ml-auto text-xs font-medium text-warning/85">open setup →</span>
    </Link>
  )
}
