import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ShieldCheck, Wand2 } from 'lucide-react'
import { modsApi } from '@/lib/api'
import { useSocket } from '@/contexts/SocketContext'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  SAFE_UPDATE_STEP_ORDER,
  initialStepStates,
  type SafeUpdateStepEvent,
  type SafeUpdateStepStates,
} from '@/lib/modsShared'
import { ModUpdateProgress } from './ModUpdateProgress'

export interface SafeModUpdateButtonProps {
  /** Mods the panel has detected updates for — shown in the confirmation list. */
  mods: Array<{ workshopId: string; name: string }>
  serverRunning: boolean
  rconConnected: boolean
  /** Called once the flow reaches a terminal state (success or failure). */
  onComplete?: () => void
}

const DEFAULT_WARNING_SECONDS = 30
type Phase = 'confirm' | 'running' | 'done'

function disabledReasonFor(serverRunning: boolean, rconConnected: boolean, modCount: number) {
  if (!serverRunning) return 'Server is not running'
  if (!rconConnected) return 'RCON is not connected'
  if (modCount === 0) return 'No mod updates detected'
  return null
}

export function SafeModUpdateButton({ mods, serverRunning, rconConnected, onComplete }: SafeModUpdateButtonProps) {
  const socket = useSocket()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('confirm')
  const [warningSeconds, setWarningSeconds] = useState(DEFAULT_WARNING_SECONDS)
  const [starting, setStarting] = useState(false)
  const [steps, setSteps] = useState<SafeUpdateStepStates>(() => initialStepStates())
  const [startError, setStartError] = useState<string | null>(null)
  const notifiedRef = useRef(false)

  const disabledReason = disabledReasonFor(serverRunning, rconConnected, mods.length)

  // Re-attach to an update kicked off before this page load (e.g. the user
  // refreshed mid-restart) so progress isn't silently lost.
  useEffect(() => {
    modsApi.getSafeUpdateStatus().then((status) => {
      if (status.inProgress) {
        setPhase('running')
        setOpen(true)
      }
    }).catch(() => { /* best effort */ })
  }, [])

  useEffect(() => {
    if (!socket) return
    const handleStep = (event: SafeUpdateStepEvent) => {
      setSteps((prev) => ({ ...prev, [event.step]: event }))
      if (event.status === 'failed') {
        setPhase('done')
        onComplete?.()
        if (!notifiedRef.current) {
          notifiedRef.current = true
          toast({
            title: `Safe update failed at "${event.step}"`,
            description: event.detail || 'See the progress panel for details.',
            variant: 'destructive',
          })
        }
      } else if (event.step === 'verify' && event.status === 'success') {
        setPhase('done')
        onComplete?.()
      }
    }
    socket.on('modUpdate:step', handleStep)
    return () => { socket.off('modUpdate:step', handleStep) }
  }, [socket, toast, onComplete])

  const resetAndOpen = useCallback(() => {
    setPhase('confirm')
    setSteps(initialStepStates())
    setStartError(null)
    notifiedRef.current = false
    setOpen(true)
  }, [])

  const handleConfirm = async () => {
    setStarting(true)
    setStartError(null)
    try {
      const result = await modsApi.safeUpdate(warningSeconds)
      setSteps(initialStepStates())
      notifiedRef.current = false
      setPhase('running')
      toast({ title: 'Safe update started', description: result.message })
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not start the safe update')
    } finally {
      setStarting(false)
    }
  }

  const failedStep = SAFE_UPDATE_STEP_ORDER.find((key) => steps[key].status === 'failed')

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button variant="warning" size="sm" onClick={resetAndOpen} disabled={!!disabledReason}>
              <Wand2 className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              Safe Update All
            </Button>
          </span>
        </TooltipTrigger>
        {disabledReason && <TooltipContent>{disabledReason}</TooltipContent>}
      </Tooltip>

      <Dialog open={open} onOpenChange={(next) => { if (!next && phase !== 'running') setOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          {phase === 'confirm' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-warning">
                  <AlertTriangle className="w-5 h-5" aria-hidden="true" />
                  Safe Update All
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    <p>This updates {mods.length} mod{mods.length === 1 ? '' : 's'} and restarts the server:</p>
                    <ul className="max-h-32 overflow-y-auto list-disc list-inside space-y-0.5 text-foreground/90">
                      {mods.slice(0, 20).map((m) => (
                        <li key={m.workshopId} className="truncate">{m.name}</li>
                      ))}
                      {mods.length > 20 && <li>+{mods.length - 20} more</li>}
                    </ul>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>A backup is created first.</li>
                      <li>Players are warned, then the server restarts.</li>
                      <li>Mods are validated/updated by Steam as part of the restart.</li>
                    </ul>
                  </div>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <Label htmlFor="safe-update-warning-seconds">Warning before restart (seconds)</Label>
                <Input
                  id="safe-update-warning-seconds"
                  type="number"
                  min={0}
                  max={600}
                  value={warningSeconds}
                  onChange={(e) => setWarningSeconds(Math.max(0, Math.min(600, Number(e.target.value) || 0)))}
                />
              </div>

              {startError && <p className="text-sm text-destructive" role="alert">{startError}</p>}

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={starting}>Cancel</Button>
                <Button variant="warning" onClick={handleConfirm} disabled={starting}>
                  {starting ? 'Starting...' : 'Start Safe Update'}
                </Button>
              </DialogFooter>
            </>
          )}

          {phase !== 'confirm' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary" aria-hidden="true" />
                  {phase === 'done' ? 'Safe Update Finished' : 'Updating Mods...'}
                </DialogTitle>
                <DialogDescription>
                  {phase === 'running'
                    ? "Don't close this window — this takes a few minutes."
                    : failedStep
                      ? 'The update stopped early — see details below.'
                      : 'All steps completed successfully.'}
                </DialogDescription>
              </DialogHeader>

              <ModUpdateProgress steps={steps} warningSeconds={warningSeconds} isRunning={phase === 'running'} />

              {failedStep && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive space-y-1">
                  <p className="font-medium">Something went wrong during &quot;{failedStep}&quot;.</p>
                  <p className="text-destructive/90 break-words" dir="auto">{steps[failedStep].detail}</p>
                  <p className="text-muted-foreground">
                    Check the server logs and resolve the issue, then try again — steps already
                    completed (like the backup) do not need to be redone.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={phase === 'running'}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
