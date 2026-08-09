import { useState } from 'react'
import { CheckCircle2, Download, X } from 'lucide-react'
import type { PlatformGuidance } from '@/lib/api'

interface PlatformGuidanceCardProps {
  guidance: PlatformGuidance
}

const PLATFORM_META: Record<string, { emoji: string; label: string }> = {
  darwin: { emoji: '🍎', label: 'macOS' },
  win32: { emoji: '🪟', label: 'Windows' },
  linux: { emoji: '🐧', label: 'Linux' },
}

const RUNTIME_LABELS: Record<string, string> = {
  orbstack: 'OrbStack',
  'docker-desktop': 'Docker Desktop',
  colima: 'Colima',
  native: 'Docker',
}

function dismissKey(platform: string): string {
  return `pz-platform-guidance-dismissed-${platform}`
}

function isDismissed(platform: string): boolean {
  try {
    return localStorage.getItem(dismissKey(platform)) === 'true'
  } catch {
    return false
  }
}

/**
 * Dismissible platform banner shown in the onboarding wizard: either
 * confirms a detected Docker runtime, or — when the platform can't run PZ
 * at all without it (macOS) — recommends where to get one.
 */
export function PlatformGuidanceCard({ guidance }: PlatformGuidanceCardProps) {
  const [dismissed, setDismissed] = useState(() => isDismissed(guidance.platform))
  const meta = PLATFORM_META[guidance.platform] ?? { emoji: '💻', label: guidance.platform }
  const hasRecommendations = guidance.recommendations.length > 0

  if (dismissed || (!guidance.canRunDocker && !hasRecommendations)) return null

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey(guidance.platform), 'true')
    } catch {
      /* ignore storage failures */
    }
    setDismissed(true)
  }

  return (
    <div className="relative rounded-lg border border-border/60 bg-muted/15 p-3 text-left">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <p className="pr-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {meta.emoji} {meta.label}
        {guidance.canRunDocker ? ' + Docker' : ' detected'}
      </p>

      {guidance.canRunDocker ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-sm text-foreground/85">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Docker detected ({RUNTIME_LABELS[guidance.dockerRuntime ?? ''] ?? guidance.dockerRuntime}) — you can run
          PZ server in a container.
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-sm text-foreground/85">
            PZ dedicated server runs on Linux — you&apos;ll need Docker to run it on {meta.label}.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {guidance.recommendations.map((rec) => (
              <a
                key={rec.label}
                href={rec.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
              >
                <Download className="h-3.5 w-3.5" /> {rec.label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
