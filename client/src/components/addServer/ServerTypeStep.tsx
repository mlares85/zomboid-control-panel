import { ArrowRight, Download, HardDrive, Info, SkipForward, Wifi } from 'lucide-react'
import type { EnvironmentSnapshot, EnvironmentMount, PlatformGuidance } from '@/lib/api'
import type { WizardSelection } from './types'
import { MacDockerGuide } from './MacDockerGuide'
import { PlatformGuidanceCard } from './PlatformGuidanceCard'

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

/** "Create a new server" card copy varies by what "new" actually means on this platform. */
function newServerCopy(guidance: PlatformGuidance) {
  if (guidance.platform === 'darwin') {
    return { title: 'Create Docker Server', description: 'Install a fresh PZ dedicated server in a Linux container.' }
  }
  if (guidance.platform === 'win32') {
    return { title: 'Install PZ Server', description: 'SteamCMD will download the dedicated server for you.' }
  }
  return { title: 'Create a new server', description: 'Install a fresh Project Zomboid dedicated server on this machine.' }
}

function WindowsFirewallTip() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <span>
        <strong className="font-medium text-foreground">Tip:</strong> Allow PZ through Windows Firewall for players
        to connect — UDP 16261 (game) + TCP 27015 (RCON).
      </span>
    </div>
  )
}

/**
 * "What do you want to do?" — the happy path is account -> this screen ->
 * Verify in two clicks when a server was already detected. macOS without
 * Docker is a dead end for local hosting, so it gets a different screen
 * entirely (MacDockerGuide) instead of options that can't work.
 */
export function ServerTypeStep({ environment, onSelect }: ServerTypeStepProps) {
  const primaryMount = environment.discoveredMounts[0]
  const guidance = environment.platformGuidance

  if (guidance.platform === 'darwin' && !guidance.canRunDocker) {
    return <MacDockerGuide onSelect={onSelect} />
  }

  const newServer = newServerCopy(guidance)

  return (
    <div className="space-y-3">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">What do you want to do?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose how to bring a server into the panel.</p>
      </div>

      <PlatformGuidanceCard guidance={guidance} />
      {guidance.platform === 'win32' && <WindowsFirewallTip />}

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
        title={newServer.title}
        description={newServer.description}
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
