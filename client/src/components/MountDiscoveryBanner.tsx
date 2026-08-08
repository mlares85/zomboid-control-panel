import { useState } from 'react'
import { Server, X, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DiscoveredMount } from '@/lib/api'

const DISMISS_KEY_PREFIX = 'pz-mount-discovery-dismissed-'

function dismissKey(mount: DiscoveredMount): string {
  return DISMISS_KEY_PREFIX + mount.installPath
}

function isDismissed(mount: DiscoveredMount): boolean {
  try {
    return localStorage.getItem(dismissKey(mount)) === 'true'
  } catch {
    return false
  }
}

interface MountDiscoveryBannerProps {
  mount: DiscoveredMount
  onConnect: (mount: DiscoveredMount) => void
}

// Shown when the panel found PZ server files at a common bind-mount path
// but no server profile has been created for it yet — lets the user skip
// typing paths and RCON settings by hand. Dismissal is remembered per
// install path so re-scans don't keep re-surfacing a mount the user
// already declined.
export function MountDiscoveryBanner({ mount, onConnect }: MountDiscoveryBannerProps) {
  const [dismissed, setDismissed] = useState(() => isDismissed(mount))

  if (dismissed) return null

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey(mount), 'true')
    } catch {
      /* ignore storage failures */
    }
    setDismissed(true)
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
          <Server className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            PZ server files detected at <code className="rounded bg-muted/40 px-1 py-0.5 font-mono text-xs">{mount.installPath}</code>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Connect it to skip typing paths and RCON settings by hand.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        <Button variant="ghost" size="sm" onClick={dismiss} aria-label="Dismiss">
          <X className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={() => onConnect(mount)}>
          Connect <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
