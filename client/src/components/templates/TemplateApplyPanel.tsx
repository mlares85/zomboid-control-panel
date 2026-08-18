import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { SimTemplateApplyResult } from '@/lib/api'
import { FieldHelp } from '@/components/FieldHelp'
import type { FieldHelpData } from '@/lib/wiki/types'

const FIELD_HELP: Record<string, FieldHelpData> = {
  scopeSandbox: {
    description: 'Apply this template\'s sandbox variable changes (difficulty, loot, zombie settings, etc).',
    context: 'Unchecking this applies only the server.ini changes below, leaving sandbox settings as they are.',
    recommendation: 'safe-default',
    articleId: 'template-diff-preview',
  },
  scopeIni: {
    description: 'Apply this template\'s server.ini changes (server-level settings, not gameplay sandbox vars).',
    context: 'Unchecking this applies only the sandbox changes above, leaving server.ini as it is.',
    recommendation: 'safe-default',
    articleId: 'template-diff-preview',
  },
}

interface TemplateApplyPanelProps {
  running: boolean
  scopeIni: boolean
  scopeSandbox: boolean
  onScopeIniChange: (v: boolean) => void
  onScopeSandboxChange: (v: boolean) => void
  applying: boolean
  applyError: string | null
  applyResult: SimTemplateApplyResult | null
  canApply: boolean
  onApply: () => void
  onClose: () => void
}

export function TemplateApplyPanel({
  running,
  scopeIni,
  scopeSandbox,
  onScopeIniChange,
  onScopeSandboxChange,
  applying,
  applyError,
  applyResult,
  canApply,
  onApply,
  onClose,
}: TemplateApplyPanelProps) {
  if (applyResult) {
    return (
      <Alert variant="success">
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Template Applied</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>
            {applyResult.ini ? `${applyResult.ini.appliedKeys.length} INI key(s) updated. ` : ''}
            {applyResult.sandbox && 'applied' in applyResult.sandbox
              ? `${applyResult.sandbox.applied.length} sandbox setting(s) updated. `
              : ''}
            {applyResult.backups.length > 0 && `${applyResult.backups.length} backup file(s) created. `}
          </p>
          <p className="font-medium">Changes will take effect the next time the server restarts.</p>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-3 border-t border-border/50 pt-3">
      {running && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Server is running</AlertTitle>
          <AlertDescription>
            Files will be updated now, but the running server won't pick up the changes until it's restarted.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-5">
        <div className="flex items-center gap-2">
          <Checkbox id="scope-sandbox" checked={scopeSandbox} onCheckedChange={(v) => onScopeSandboxChange(v === true)} />
          <Label htmlFor="scope-sandbox" className="flex items-center gap-1.5 text-sm font-normal">
            Apply sandbox changes
            <FieldHelp {...FIELD_HELP.scopeSandbox} />
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="scope-ini" checked={scopeIni} onCheckedChange={(v) => onScopeIniChange(v === true)} />
          <Label htmlFor="scope-ini" className="flex items-center gap-1.5 text-sm font-normal">
            Apply server.ini changes
            <FieldHelp {...FIELD_HELP.scopeIni} />
          </Label>
        </div>
      </div>

      {applyError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Apply Failed</AlertTitle>
          <AlertDescription>{applyError}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={applying}>
          Cancel
        </Button>
        <Button onClick={onApply} disabled={applying || !canApply || (!scopeIni && !scopeSandbox)}>
          {applying && <Loader2 className="h-4 w-4 animate-spin" />}
          Apply Template
        </Button>
      </div>
    </div>
  )
}
