import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertCircle, AlertTriangle, Loader2, Puzzle, RefreshCw } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { TacticalPanel, SectionHeader } from './ConfigPanels'
import { ModSettingsToolbar } from './ModSettingsToolbar'
import { ModSettingsGroupList } from './ModSettingsGroupList'
import { useModSettings } from '@/hooks/serverConfig/useModSettings'

export function ModSettingsTab({ modSettings: mod }: { modSettings: ReturnType<typeof useModSettings> }) {
  const {
    modSettings, modSettingsGroups, modSettingsLoading, modSettingsError,
    modSettingsSearch, setModSettingsSearch, modSettingsModifiedOnly, setModSettingsModifiedOnly,
    expandedModGroups, setExpandedModGroups, modSettingsLastLoaded, modSettingsSearchRef,
    savingOptions, isOptModified, modifiedModSettingsCount, filteredModGroups,
    loadModSettings, handleOptionChange,
  } = mod

  return (
    <TacticalPanel tone={modifiedModSettingsCount > 0 ? 'warning' : 'info'}>
      <SectionHeader
        label="Mod sandbox options"
        sublabel={modSettings ? `${modSettingsGroups.length} mod${modSettingsGroups.length === 1 ? '' : 's'} · live from bridge` : 'panelbridge · live'}
        icon={Puzzle}
        tone={modifiedModSettingsCount > 0 ? 'warning' : 'info'}
        action={
          <div className="flex items-center gap-1.5">
            {modifiedModSettingsCount > 0 && (
              <Badge variant="warning" className="h-5 px-1.5 py-0 font-mono text-[10px]">
                {modifiedModSettingsCount} modified
              </Badge>
            )}
            <Button variant="command" size="sm" onClick={loadModSettings} disabled={modSettingsLoading} className="h-7 gap-1.5 text-xs font-medium">
              {modSettingsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {modSettings ? 'refresh' : 'load'}
            </Button>
          </div>
        }
      />
      <div className="p-4">
        {modSettings && modSettingsGroups.length > 0 && (
          <ModSettingsToolbar
            searchRef={modSettingsSearchRef}
            modSettingsSearch={modSettingsSearch}
            setModSettingsSearch={setModSettingsSearch}
            modSettingsModifiedOnly={modSettingsModifiedOnly}
            setModSettingsModifiedOnly={setModSettingsModifiedOnly}
            modifiedModSettingsCount={modifiedModSettingsCount}
            filteredModGroups={filteredModGroups}
            expandedModGroups={expandedModGroups}
            setExpandedModGroups={setExpandedModGroups}
          />
        )}
        {!modSettings && !modSettingsLoading && !modSettingsError && (
          <EmptyState
            type="noMods"
            title="Mod settings not loaded"
            description="Click load to fetch sandbox options from all installed mods via PanelBridge. The PZ server must be running with PanelBridge active."
          />
        )}

        {modSettingsError && (
          <Alert variant={modSettings ? 'default' : 'destructive'} className="mb-3">
            <AlertCircle className="w-4 h-4" />
            <AlertTitle>{modSettings ? 'Refresh failed — showing previous data' : 'Failed to load mod settings'}</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-3">
              <span className="break-words min-w-0">{modSettingsError}</span>
              <Button variant="outline" size="sm" onClick={loadModSettings} disabled={modSettingsLoading} className="shrink-0 gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {modSettingsLoading && (
          <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading sandbox options from server...</span>
          </div>
        )}

        {modSettings && modSettingsGroups.length === 0 && !modSettingsLoading && (
          <EmptyState
            type="noMods"
            title="No sandbox options found"
            description="The server returned no sandbox options. This may happen if no mods register custom sandbox settings, or the API isn't available in this PZ build."
          />
        )}

        {modSettings && modSettingsGroups.length > 0 && (
          <ScrollArea className="h-[calc(100vh-440px)] min-h-[400px] pr-4">
            <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
              <Badge variant="secondary">
                {modSettingsSearch || modSettingsModifiedOnly ? `${filteredModGroups.length} / ${modSettingsGroups.length}` : modSettingsGroups.length} groups
              </Badge>
              <Badge variant="secondary">
                {modSettingsSearch || modSettingsModifiedOnly
                  ? `${filteredModGroups.reduce((s, g) => s + g.filteredOpts.length, 0)} / ${modSettingsGroups.reduce((s, g) => s + g.count, 0)}`
                  : modSettingsGroups.reduce((s, g) => s + g.count, 0)
                } options
              </Badge>
              {modifiedModSettingsCount > 0 && (
                <Badge variant="warning" className="gap-1" title="Options that differ from their default value">
                  <AlertTriangle className="w-3 h-3" />
                  {modifiedModSettingsCount} modified
                </Badge>
              )}
              {modSettingsLastLoaded && (
                <span className="text-xs text-muted-foreground/60 ml-auto">
                  Loaded {modSettingsLastLoaded.toLocaleTimeString()}
                </span>
              )}
            </div>
            <ModSettingsGroupList
              filteredModGroups={filteredModGroups}
              modSettings={modSettings}
              expandedModGroups={expandedModGroups}
              setExpandedModGroups={setExpandedModGroups}
              isOptModified={isOptModified}
              savingOptions={savingOptions}
              onOptionChange={handleOptionChange}
              modSettingsSearch={modSettingsSearch}
              modSettingsModifiedOnly={modSettingsModifiedOnly}
              onClearSearch={() => setModSettingsSearch('')}
              onClearModifiedOnly={() => setModSettingsModifiedOnly(false)}
            />
          </ScrollArea>
        )}
      </div>
    </TacticalPanel>
  )
}
