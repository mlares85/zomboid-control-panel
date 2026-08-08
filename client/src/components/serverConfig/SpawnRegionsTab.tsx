import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Download, Loader2, Map, Plus, Save, Trash2 } from 'lucide-react'
import { TacticalPanel, SectionHeader } from './ConfigPanels'
import { EditorModeToggle } from './EditorModeToggle'
import { EmptyState } from '@/components/EmptyState'
import { EditorMode } from '@/lib/serverConfigTypes'
import { SpawnRegion } from '@/lib/api'

export function SpawnRegionsTab({
  editorMode,
  onStructured,
  onRaw,
  rawContent,
  onRawContentChange,
  spawnRegions,
  setSpawnRegions,
  onDownloadBackup,
  onSave,
  saving,
}: {
  editorMode: EditorMode
  onStructured: () => void
  onRaw: () => void
  rawContent: string
  onRawContentChange: (value: string) => void
  spawnRegions: SpawnRegion[]
  setSpawnRegions: (regions: SpawnRegion[]) => void
  onDownloadBackup: () => void
  onSave: () => void
  saving: boolean
}) {
  return (
    <TacticalPanel tone="primary">
      <SectionHeader
        label="Spawn regions"
        sublabel={`${spawnRegions.length} region${spawnRegions.length === 1 ? '' : 's'} · cities & towns`}
        icon={Map}
        action={
          <div className="flex items-center gap-1.5">
            <EditorModeToggle editorMode={editorMode} onStructured={onStructured} onRaw={onRaw} />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={onDownloadBackup} aria-label="Download Spawn Regions backup">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download Spawnregions backup</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button onClick={onSave} disabled={saving} variant="command" size="sm" className="h-7 gap-1.5 text-xs font-medium">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              save
            </Button>
          </div>
        }
      />
      <div className="p-4">
        {editorMode === 'raw' ? (
          <Textarea
            value={rawContent}
            onChange={(e) => onRawContentChange(e.target.value)}
            className="h-[400px] resize-y font-mono text-sm"
            spellCheck={false}
          />
        ) : (
          <div className="space-y-3">
            {spawnRegions.length === 0 ? (
              <EmptyState type="noData" title="No spawn regions found" description="Try switching to Raw mode to view the file contents" compact />
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <div className="hidden sm:grid grid-cols-[2rem_minmax(180px,260px)_minmax(0,1fr)_2.25rem] items-center gap-3 border-b bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="text-center">#</span>
                  <span>Display Name</span>
                  <span>Map File Path</span>
                  <span aria-hidden="true" />
                </div>
                <ul className="divide-y divide-border/60">
                  {spawnRegions.map((region, index) => (
                    <li
                      key={index}
                      className="grid grid-cols-1 gap-3 px-3 py-2.5 sm:grid-cols-[2rem_minmax(180px,260px)_minmax(0,1fr)_2.25rem] sm:items-center"
                    >
                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-muted/40 px-1.5 text-xs font-mono font-medium text-muted-foreground sm:justify-self-center">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <Label className="sm:sr-only text-[10px] uppercase tracking-wide text-muted-foreground">Display Name</Label>
                        <Input
                          value={region.name}
                          onChange={(e) => {
                            const newRegions = [...spawnRegions]
                            newRegions[index] = { ...region, name: e.target.value }
                            setSpawnRegions(newRegions)
                          }}
                          placeholder="e.g., Muldraugh, KY"
                          maxLength={64}
                          className="mt-0.5 h-9 sm:mt-0"
                          aria-label={`Region ${index + 1} display name`}
                        />
                      </div>
                      <div className="min-w-0">
                        <Label className="sm:sr-only text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                          {region.isServerFile ? 'Server File' : 'Map File Path'}
                          {region.isServerFile && (
                            <Badge variant="secondary" className="text-[10px] py-0">serverfile</Badge>
                          )}
                        </Label>
                        <div className="relative mt-0.5 sm:mt-0">
                          <Input
                            value={region.file}
                            onChange={(e) => {
                              const newRegions = [...spawnRegions]
                              newRegions[index] = { ...region, file: e.target.value }
                              setSpawnRegions(newRegions)
                            }}
                            placeholder={region.isServerFile ? "ServerName_spawnpoints.lua" : "media/maps/Muldraugh, KY/spawnpoints.lua"}
                            className={`h-9 font-mono text-xs ${region.isServerFile ? 'pr-20' : ''}`}
                            maxLength={512}
                            aria-label={`Region ${index + 1} ${region.isServerFile ? 'server file' : 'map file path'}`}
                          />
                          {region.isServerFile && (
                            <Badge variant="secondary" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] py-0">
                              serverfile
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 justify-self-end text-muted-foreground hover:text-destructive sm:justify-self-center"
                        onClick={() => setSpawnRegions(spawnRegions.filter((_, i) => i !== index))}
                        aria-label={`Delete spawn region ${region.name || index + 1}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSpawnRegions([...spawnRegions, { name: '', file: 'media/maps/' }])}
                className="gap-1.5 text-xs font-medium"
              >
                <Plus className="h-3.5 w-3.5" /> add region
              </Button>
            </div>
          </div>
        )}
      </div>
    </TacticalPanel>
  )
}
