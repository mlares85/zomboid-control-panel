import { Button } from '@/components/ui/button'
import { AlertTriangle, Loader2, Save, Undo2 } from 'lucide-react'

// Sticky save bar — appears when there are unsaved changes on the active tab.
export function StickySaveBar({
  activeTab,
  changedCount,
  saving,
  onDiscard,
  onSave,
}: {
  activeTab: 'ini' | 'sandbox'
  changedCount: number
  saving: boolean
  onDiscard: () => void
  onSave: () => void
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 sm:px-6 sm:pb-5">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex w-full max-w-3xl items-center gap-3 rounded-lg border border-warning/40 bg-card/95 px-4 py-2.5 shadow-lg shadow-black/30 backdrop-blur supports-[backdrop-filter]:bg-card/80 motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:fade-in"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-warning/15 text-warning">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-foreground">
            {changedCount} unsaved {changedCount === 1 ? 'change' : 'changes'}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {activeTab === 'ini' ? 'server ini' : 'sandbox lua'} · ctrl+s to save · applies on reload
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDiscard}
          disabled={saving}
          className="h-8 gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive"
        >
          <Undo2 className="h-3 w-3" /> discard
        </Button>
        <Button variant="command" size="sm" onClick={onSave} disabled={saving} className="h-8 gap-1.5 text-xs font-medium">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          save &amp; reload
        </Button>
      </div>
    </div>
  )
}
