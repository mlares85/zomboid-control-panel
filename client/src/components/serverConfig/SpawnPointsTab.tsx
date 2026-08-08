import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Check, Code, Copy, Download, ExternalLink, Loader2, MapPin, Save } from 'lucide-react'
import { TacticalPanel, SectionHeader } from './ConfigPanels'
import { EditorModeToggle } from './EditorModeToggle'
import { EditorMode } from '@/lib/serverConfigTypes'

export function SpawnPointsTab({
  editorMode,
  onStructured,
  onRaw,
  rawContent,
  onRawContentChange,
  copied,
  onCopyRaw,
  onDownloadBackup,
  onSave,
  saving,
}: {
  editorMode: EditorMode
  onStructured: () => void
  onRaw: () => void
  rawContent: string
  onRawContentChange: (value: string) => void
  copied: boolean
  onCopyRaw: () => void
  onDownloadBackup: () => void
  onSave: () => void
  saving: boolean
}) {
  return (
    <TacticalPanel tone="muted">
      <SectionHeader
        label="Spawn points"
        sublabel="mod-managed · player start locations"
        icon={MapPin}
        tone="muted"
        action={
          <div className="flex items-center gap-1.5">
            <EditorModeToggle editorMode={editorMode} onStructured={onStructured} onRaw={onRaw} structuredLabel="info" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={onDownloadBackup} aria-label="Download Spawn Points backup">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download Spawnpoints backup</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <a
              href="https://map.projectzomboid.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 items-center gap-1 rounded border border-border/60 bg-muted/30 px-2 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" /> map
            </a>
            {editorMode === 'raw' && (
              <Button onClick={onSave} disabled={saving} variant="command" size="sm" className="h-7 gap-1.5 text-xs font-medium">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                save
              </Button>
            )}
          </div>
        }
      />
      <div className="p-4">
        {editorMode === 'raw' ? (
          <div className="relative">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="absolute top-2 right-2 z-10" onClick={onCopyRaw}>
                    {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copied ? 'Copied!' : 'Copy to clipboard'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Textarea
              value={rawContent}
              onChange={(e) => onRawContentChange(e.target.value)}
              className="h-[400px] resize-y font-mono text-sm"
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
              <MapPin className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-medium mb-2">Spawn points are mod-managed</h3>
            <p className="text-muted-foreground max-w-md mx-auto text-sm">
              Spawn locations are typically handled by mods like &ldquo;Spawn Select.&rdquo;
              Switch to <strong>raw</strong> to inspect or edit the file directly.
            </p>
            <div className="mt-6">
              <Button variant="outline" onClick={onRaw} className="gap-1.5 text-xs font-medium">
                <Code className="h-3.5 w-3.5" /> open raw file
              </Button>
            </div>
          </div>
        )}
      </div>
    </TacticalPanel>
  )
}
