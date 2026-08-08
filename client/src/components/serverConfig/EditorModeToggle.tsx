import { Button } from '@/components/ui/button'
import { Code, FormInput } from 'lucide-react'
import { EditorMode } from '@/lib/serverConfigTypes'

// Form/Raw toggle button group shared by every tab that supports a raw-text editor.
export function EditorModeToggle({
  editorMode,
  onStructured,
  onRaw,
  structuredLabel = 'Form',
}: {
  editorMode: EditorMode
  onStructured: () => void
  onRaw: () => void
  structuredLabel?: string
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/30 p-0.5">
      <Button
        variant={editorMode === 'structured' ? 'secondary' : 'ghost'}
        size="sm"
        onClick={onStructured}
        className="h-7 gap-1.5 px-2 text-xs font-medium"
        aria-pressed={editorMode === 'structured'}
      >
        <FormInput className="h-3 w-3" /> {structuredLabel}
      </Button>
      <Button
        variant={editorMode === 'raw' ? 'secondary' : 'ghost'}
        size="sm"
        onClick={onRaw}
        className="h-7 gap-1.5 px-2 text-xs font-medium"
        aria-pressed={editorMode === 'raw'}
      >
        <Code className="h-3 w-3" /> Raw
      </Button>
    </div>
  )
}
