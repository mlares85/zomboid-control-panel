import { useCallback, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AuthScreenLayout } from '@/components/AuthScreenLayout'
import { EnvironmentStep } from './EnvironmentStep'
import { ServerTypeStep } from './ServerTypeStep'
import { ConfigureStep } from './ConfigureStep'
import { VerifyStep } from './VerifyStep'
import { CompleteStep } from './CompleteStep'
import type { EnvironmentSnapshot, WizardSelection, WizardStepId } from './types'

interface AddServerFlowProps {
  /** Full-screen during first run, or a modal launched from the Servers page. */
  mode: 'firstRun' | 'dialog'
  /** Called with the new server's id, or null when the user skipped. */
  onComplete: (serverId: string | number | null) => void
  /** Dialog mode only. */
  open?: boolean
  onClose?: () => void
}

// Display step -> its position in the 4-dot progress bar. server-type and
// configure share a dot ("Server") since they're one logical decision.
const PROGRESS_STEP: Record<WizardStepId, number> = {
  environment: 0,
  'server-type': 1,
  configure: 1,
  verify: 2,
  complete: 3,
}
const PROGRESS_LABELS = ['Environment', 'Server', 'Verify', 'Online']

function ProgressBar({ step }: { step: WizardStepId }) {
  const current = PROGRESS_STEP[step]
  return (
    <ol className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground" aria-label="Add server progress">
      {PROGRESS_LABELS.map((label, i) => (
        <li key={label} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden="true" className="h-px w-4 bg-border/60" />}
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold ${
              i <= current ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border/60 bg-muted/20 text-muted-foreground'
            }`}
          >
            {i + 1}
          </span>
          <span className={i <= current ? 'text-foreground/80' : ''}>{label}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * Single orchestrator for adding a server — one state machine rendered
 * full-screen during first run or as a dialog from Servers. Steps:
 * environment (auto-detect) -> server-type (what to do) -> configure
 * (create/connect) -> verify (live checklist) -> complete.
 */
export function AddServerFlow({ mode, onComplete, open = true, onClose }: AddServerFlowProps) {
  const [step, setStep] = useState<WizardStepId>('environment')
  const [environment, setEnvironment] = useState<EnvironmentSnapshot | null>(null)
  const [selection, setSelection] = useState<WizardSelection | null>(null)
  const [serverId, setServerId] = useState<string | number | null>(null)

  const handleEnvironment = useCallback((env: EnvironmentSnapshot) => {
    setEnvironment(env)
    setStep('server-type')
  }, [])

  const handleSelect = useCallback(
    (sel: WizardSelection) => {
      if (sel.intent === 'skip') {
        onComplete(null)
        return
      }
      setSelection(sel)
      setStep('configure')
    },
    [onComplete],
  )

  const handleCreated = useCallback((id: string | number) => {
    setServerId(id)
    setStep('verify')
  }, [])

  let content: React.ReactNode = null
  if (step === 'environment') {
    content = <EnvironmentStep onComplete={handleEnvironment} />
  } else if (step === 'server-type' && environment) {
    content = <ServerTypeStep environment={environment} onSelect={handleSelect} />
  } else if (step === 'configure' && selection) {
    content = (
      <ConfigureStep
        selection={selection}
        onCreated={handleCreated}
        onBack={() => setStep('server-type')}
      />
    )
  } else if (step === 'verify' && serverId != null) {
    content = <VerifyStep serverId={serverId} onVerified={() => setStep('complete')} />
  } else if (step === 'complete' && serverId != null) {
    content = <CompleteStep serverId={serverId} platform={environment?.platform} onGoToDashboard={() => onComplete(serverId)} />
  }

  if (mode === 'dialog') {
    // Install flows (configure with intent='new') need more room than
    // the simple detection/connection forms.
    const isInstallFlow = step === 'configure' && selection?.intent === 'new'
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
        <DialogContent className={`${isInstallFlow ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto transition-[max-width]`}>
          <DialogHeader>
            <DialogTitle>Add Server</DialogTitle>
          </DialogHeader>
          <ProgressBar step={step} />
          {content}
        </DialogContent>
      </Dialog>
    )
  }

  // Install flows need more horizontal room than the narrow auth card
  const isInstallFlow = step === 'configure' && selection?.intent === 'new'

  return (
    <AuthScreenLayout
      badge="First-Run Setup"
      title="Bring in your server"
      description="A couple of automated checks, then you're managing a live Project Zomboid server."
      wide={isInstallFlow}
    >
      <ProgressBar step={step} />
      {content}
    </AuthScreenLayout>
  )
}
