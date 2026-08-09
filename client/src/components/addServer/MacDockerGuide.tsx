import { ArrowRight, Download, SkipForward, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WizardSelection } from './types'

interface MacDockerGuideProps {
  onSelect: (selection: WizardSelection) => void
}

const INSTALL_OPTIONS = [
  {
    key: 'orbstack',
    label: 'Install OrbStack (Recommended)',
    url: 'https://orbstack.dev',
    description: 'Lightweight, fast Docker runtime built for macOS.',
    highlight: true,
  },
  {
    key: 'docker-desktop',
    label: 'Install Docker Desktop',
    url: 'https://www.docker.com/products/docker-desktop',
    description: "Docker's official desktop app for macOS.",
    highlight: false,
  },
]

/**
 * Shown instead of the normal "what do you want to do?" list when the
 * panel detects macOS without a Docker runtime — PZ's dedicated server is
 * Linux-only, so there's nothing useful to offer here except "go get
 * Docker" or "point me at a server that already exists".
 */
export function MacDockerGuide({ onSelect }: MacDockerGuideProps) {
  return (
    <div className="space-y-3">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">🍎 macOS Detected</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          PZ dedicated server runs on Linux — you&apos;ll need Docker to run it on your Mac.
        </p>
      </div>

      {INSTALL_OPTIONS.map((opt) => (
        <a
          key={opt.key}
          href={opt.url}
          target="_blank"
          rel="noreferrer"
          className={`flex items-center justify-between gap-3 rounded-xl border-2 p-4 text-left transition-colors ${
            opt.highlight
              ? 'border-primary bg-primary/5 hover:bg-primary/10'
              : 'border-border/60 hover:border-primary/40 hover:bg-muted/20'
          }`}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{opt.label}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{opt.description}</p>
          </div>
          <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
        </a>
      ))}

      <p className="text-center text-xs text-muted-foreground">
        After installing, restart the panel and try again.
      </p>

      <Button variant="outline" className="w-full" onClick={() => onSelect({ intent: 'existing' })}>
        <Wifi className="mr-2 h-4 w-4" /> I have a remote PZ server <ArrowRight className="ml-2 h-4 w-4" />
      </Button>

      <button
        type="button"
        onClick={() => onSelect({ intent: 'skip' })}
        className="flex w-full items-center justify-center gap-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <SkipForward className="h-3.5 w-3.5" /> Skip for now
      </button>
    </div>
  )
}
