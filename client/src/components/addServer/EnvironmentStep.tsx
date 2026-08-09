import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Container, HardDrive, Loader2, Monitor, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { environmentApi, type EnvironmentSnapshot } from '@/lib/api'
import { reportClientWarning } from '@/lib/client-errors'

interface EnvironmentStepProps {
  onComplete: (environment: EnvironmentSnapshot) => void
}

interface ChecklistLine {
  label: string
  detail: string
}

function buildChecklist(env: EnvironmentSnapshot): ChecklistLine[] {
  const lines: ChecklistLine[] = [
    {
      label: 'Platform',
      detail: env.containerized ? `Docker container (${env.platform} host)` : env.platform,
    },
    {
      label: 'Docker socket',
      detail: env.hasDockerSocket ? 'mounted' : env.containerized ? 'not mounted' : 'n/a',
    },
  ]
  if (env.discoveredMounts.length > 0) {
    for (const mount of env.discoveredMounts) {
      lines.push({
        label: mount.type === 'data' ? 'Found PZ save data' : 'Found PZ server files',
        detail: mount.path,
      })
    }
  } else {
    lines.push({ label: 'Server files', detail: 'none found automatically' })
  }
  lines.push({
    label: 'Existing servers in panel',
    detail: String(env.serverCount),
  })
  return lines
}

/**
 * First wizard step: calls GET /api/system/environment and reveals the
 * findings one line at a time before auto-advancing. "Detect everything,
 * confirm anything ambiguous, ask only about intent."
 */
export function EnvironmentStep({ onComplete }: EnvironmentStepProps) {
  const [environment, setEnvironment] = useState<EnvironmentSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(0)
  const advancedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    environmentApi
      .get()
      .then((data) => {
        if (!cancelled) setEnvironment(data)
      })
      .catch((err) => {
        reportClientWarning('Failed to load environment snapshot.', err)
        if (!cancelled) setError(err instanceof Error ? err.message : 'Detection failed')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const checklist = environment ? buildChecklist(environment) : []

  useEffect(() => {
    if (!environment || revealed >= checklist.length) return
    const id = setTimeout(() => setRevealed((n) => n + 1), 260)
    return () => clearTimeout(id)
  }, [environment, revealed, checklist.length])

  useEffect(() => {
    if (!environment || advancedRef.current) return
    if (revealed < checklist.length) return
    advancedRef.current = true
    const id = setTimeout(() => onComplete(environment), 500)
    return () => clearTimeout(id)
  }, [environment, revealed, checklist.length, onComplete])

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          {environment ? <Container className="h-5 w-5" /> : <Loader2 className="h-5 w-5 animate-spin" />}
        </div>
        <h2 className="text-lg font-semibold text-foreground">Scanning your environment</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Looking for a Project Zomboid server, Docker, and existing panel state.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-sm text-destructive">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <ul className="space-y-2 font-mono text-xs" aria-live="polite">
        {checklist.slice(0, revealed).map((line) => (
          <li key={line.label} className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/15 px-3 py-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="text-foreground/85">
              <strong className="font-semibold text-foreground">{line.label}:</strong> {line.detail}
            </span>
          </li>
        ))}
      </ul>

      {error && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() =>
            onComplete({
              platform: 'unknown',
              containerized: false,
              hasDockerSocket: false,
              envPaths: { PZ_SERVER_PATH: null, PZ_SAVE_PATH: null },
              discoveredMounts: [],
              serverCount: 0,
            })
          }
        >
          <Monitor className="mr-2 h-4 w-4" /> Continue without auto-detection
        </Button>
      )}

      {environment && revealed >= checklist.length && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <HardDrive className="h-3.5 w-3.5" /> Continuing…
        </p>
      )}
    </div>
  )
}
