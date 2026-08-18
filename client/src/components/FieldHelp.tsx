import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WikiLink } from '@/components/WikiLink'
import { cn } from '@/lib/utils'
import type { FieldHelpData, FieldRecommendation } from '@/lib/wiki/types'

const RECOMMENDATION_STYLES: Record<FieldRecommendation, { label: string; className: string }> = {
  'safe-default': { label: 'Default is fine', className: 'border-success/30 bg-success/10 text-success' },
  'must-configure': { label: 'Must configure', className: 'border-warning/40 bg-warning/10 text-warning' },
  advanced: { label: 'Advanced', className: 'border-border/60 bg-muted/40 text-muted-foreground' },
}

interface FieldHelpProps extends FieldHelpData {
  className?: string
}

// Help icon + tooltip for a single form field — description, why it matters,
// a recommendation badge, and an optional link out to the fuller wiki article.
export function FieldHelp({ description, context, recommendation, articleId, className }: FieldHelpProps) {
  const badge = RECOMMENDATION_STYLES[recommendation]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/70 transition-colors hover:text-foreground',
            className
          )}
          aria-label={`Help: ${description}`}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs space-y-1.5 py-2">
        <p className="text-xs text-foreground">{description}</p>
        <p className="text-[11px] leading-snug text-muted-foreground/80">{context}</p>
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
            badge.className
          )}
        >
          {badge.label}
        </span>
        {articleId && (
          <div>
            <WikiLink articleId={articleId} className="text-[11px]">
              Learn more →
            </WikiLink>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
