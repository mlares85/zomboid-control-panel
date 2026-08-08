import { Check, CheckCircle2, Circle, Loader2, X } from 'lucide-react'
import {
  SAFE_UPDATE_STEP_ORDER,
  estimateSecondsRemaining,
  type SafeUpdateStepKey,
  type SafeUpdateStepStates,
  type SafeUpdateStepStatus,
} from '@/lib/modsShared'

const STEP_LABELS: Record<SafeUpdateStepKey, string> = {
  backup: 'Backup',
  update: 'Update Mods',
  warning: 'Warning Players',
  restart: 'Restart',
  verify: 'Verify',
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'almost done'
  if (seconds < 60) return `~${seconds}s remaining`
  const minutes = Math.ceil(seconds / 60)
  return `~${minutes} min remaining`
}

function StepIcon({ status }: { status: SafeUpdateStepStatus }) {
  if (status === 'success') return <Check className="w-4 h-4 text-success" aria-hidden="true" />
  if (status === 'failed') return <X className="w-4 h-4 text-destructive" aria-hidden="true" />
  if (status === 'in_progress') return <Loader2 className="w-4 h-4 text-primary animate-spin" aria-hidden="true" />
  return <Circle className="w-3.5 h-3.5 text-muted-foreground/40" aria-hidden="true" />
}

export interface ModUpdateProgressProps {
  steps: SafeUpdateStepStates
  warningSeconds: number
  isRunning: boolean
}

export function ModUpdateProgress({ steps, warningSeconds, isRunning }: ModUpdateProgressProps) {
  const remaining = estimateSecondsRemaining(steps, warningSeconds)
  const verifyDone = steps.verify.status === 'success'

  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <ol className="space-y-1.5">
        {SAFE_UPDATE_STEP_ORDER.map((key) => {
          const state = steps[key]
          return (
            <li
              key={key}
              className={`flex items-start gap-2.5 rounded-md px-2.5 py-2 text-sm ${
                state.status === 'in_progress' ? 'bg-primary/5' : ''
              }`}
            >
              <span className="mt-0.5 shrink-0">
                <StepIcon status={state.status} />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`font-medium ${
                    state.status === 'failed'
                      ? 'text-destructive'
                      : state.status === 'pending'
                        ? 'text-muted-foreground'
                        : 'text-foreground'
                  }`}
                >
                  {STEP_LABELS[key]}
                </p>
                {state.detail && (
                  <p className="text-xs text-muted-foreground mt-0.5 break-words" dir="auto">
                    {state.detail}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {isRunning && !verifyDone && (
        <p className="text-xs text-muted-foreground text-center">{formatRemaining(remaining)}</p>
      )}

      {verifyDone && (
        <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          Server is back online
        </div>
      )}
    </div>
  )
}
