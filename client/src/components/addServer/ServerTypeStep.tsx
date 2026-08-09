import { ArrowRight, Download, HardDrive, SkipForward, Wifi } from 'lucide-react'
import type { EnvironmentSnapshot, EnvironmentMount } from '@/lib/api'
import type { WizardSelection } from './types'

interface ServerTypeStepProps {
  environment: EnvironmentSnapshot
  onSelect: (selection: WizardSelection) => void
}

function OptionCard({
  icon,
  title,
  description,
  onClick,
  highlight,
}: {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
  highlight?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors ${
        highlight
          ? 'border-primary bg-primary/5 hover:bg-primary/10'
          : 'border-border/60 hover:border-primary/40 hover:bg-muted/20'
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
          highlight ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border/60 bg-muted/30 text-muted-foreground'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function detectedCardCopy(mount: EnvironmentMount) {
  if (mount.type === 'data') {
    return `Save data found at ${mount.path}. We can connect to it in one click.`
  }
  return `Server files found at ${mount.path}. We can connect to it in one click.`
}

/**
 * "What do you want to do?" — the Unraid happy path is account -> this
 * screen -> Verify in two clicks when a server was already detected.
 */
export function ServerTypeStep({ environment, onSelect }: ServerTypeStepProps) {
  const primaryMount = environment.discoveredMounts[0]

  return (
    <div className="space-y-3">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">What do you want to do?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose how to bring a server into the panel.</p>
      </div>

      {primaryMount && (
        <OptionCard
          icon={<HardDrive className="h-5 w-5" />}
          title="Connect to the server we found"
          description={detectedCardCopy(primaryMount)}
          highlight
          onClick={() => onSelect({ intent: 'detected', mount: primaryMount })}
        />
      )}

      <OptionCard
        icon={<Download className="h-5 w-5" />}
        title="Create a new server"
        description="Install a fresh Project Zomboid dedicated server on this machine."
        onClick={() => onSelect({ intent: 'new' })}
      />

      <OptionCard
        icon={<Wifi className="h-5 w-5" />}
        title="Connect to an existing server"
        description="Point the panel at a server already running, locally or remotely."
        onClick={() => onSelect({ intent: 'existing' })}
      />

      <OptionCard
        icon={<SkipForward className="h-5 w-5" />}
        title="Skip for now"
        description="Go to the dashboard. A setup checklist will keep track of what's left."
        onClick={() => onSelect({ intent: 'skip' })}
      />
    </div>
  )
}
