import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertTriangle, Check, Copy, Download, ExternalLink, FileText, Loader2, Save } from 'lucide-react'
import { TacticalPanel, SectionHeader } from './ConfigPanels'
import { EditorModeToggle } from './EditorModeToggle'
import { SettingsSearchFilterBar } from './SettingsSearchFilterBar'
import { CategoryRail } from './CategoryRail'
import { IniSettingRow } from './IniSettingRow'
import { IniUncategorizedPanel } from './IniUncategorizedPanel'
import { INI_CATEGORIES, INI_CATEGORY_GROUPS } from '@/lib/serverConfigSchema'
import { EditorMode, FilterMode } from '@/lib/serverConfigTypes'
import { useIniConfig } from '@/hooks/serverConfig/useIniConfig'

export function IniSettingsTab({
  ini,
  iniSettings,
  originalIniSettings,
  editorMode,
  onStructured,
  onRaw,
  rawContent,
  onRawContentChange,
  copied,
  onCopyRaw,
  onDownloadBackup,
  saving,
  searchQuery,
  onSearchQueryChange,
  filterMode,
  onFilterModeChange,
  searchResultsCount,
  collapsedGroups,
  toggleGroup,
  onToggleAllCollapsed,
  allCollapsed,
  onBrowse,
}: {
  ini: ReturnType<typeof useIniConfig>
  iniSettings: Record<string, string>
  originalIniSettings: Record<string, string>
  editorMode: EditorMode
  onStructured: () => void
  onRaw: () => void
  rawContent: string
  onRawContentChange: (value: string) => void
  copied: boolean
  onCopyRaw: () => void
  onDownloadBackup: () => void
  saving: boolean
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  filterMode: FilterMode
  onFilterModeChange: (mode: FilterMode) => void
  searchResultsCount: number
  collapsedGroups: Record<string, boolean>
  toggleGroup: (key: string) => void
  onToggleAllCollapsed: () => void
  allCollapsed: boolean
  onBrowse: (key: string, extensions?: string[]) => void
}) {
  const {
    hasIniChanges, updateIniValue, resetIniValue, changedIniCount, handleSaveIni,
    filteredIniSettings, iniModifiedByCategory, uncategorizedIniKeys,
    activeIniCategory, setActiveIniCategory,
  } = ini

  const countByCategory = Object.fromEntries(INI_CATEGORIES.map(c => [c.id, (filteredIniSettings[c.id] || []).length]))

  return (
    <TacticalPanel tone={hasIniChanges ? 'warning' : 'primary'}>
      <SectionHeader
        label="Server settings"
        sublabel="INI · behavior, network, players"
        icon={FileText}
        tone={hasIniChanges ? 'warning' : 'primary'}
        action={
          <div className="flex items-center gap-1.5">
            {hasIniChanges && (
              <Badge variant="warning" className="h-5 px-1.5 py-0 font-mono text-[10px]">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {changedIniCount}
              </Badge>
            )}
            <EditorModeToggle editorMode={editorMode} onStructured={onStructured} onRaw={onRaw} />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={onDownloadBackup} aria-label="Download INI backup">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download INI backup</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <a
              href="https://pzwiki.net/wiki/Server_settings"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 items-center gap-1 rounded border border-border/60 bg-muted/30 px-2 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" /> Wiki
            </a>
            <Button onClick={handleSaveIni} disabled={saving || !hasIniChanges} variant="command" size="sm" className="h-7 gap-1.5 text-xs font-medium">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save &amp; reload
            </Button>
          </div>
        }
      />
      <div className="p-4">
        {iniSettings['DoLuaChecksum']?.toLowerCase() === 'true' && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Lua Checksum is enabled</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span className="min-w-0 flex-1">
                  PanelBridge modifies server-side Lua files. With Lua Checksum enabled, clients will fail verification and cannot connect. Disable <strong>DoLuaChecksum</strong> in the Mods category to allow players to join.
                </span>
                <Button size="sm" variant="command" className="h-7 shrink-0 gap-1.5 text-xs font-medium" onClick={() => updateIniValue('DoLuaChecksum', 'false')}>
                  disable now
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
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
              className="h-[calc(100vh-380px)] min-h-[400px] resize-y font-mono text-sm"
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="min-h-[400px]">
            <SettingsSearchFilterBar
              placeholder="Search server settings…"
              ariaLabel="Search server settings"
              searchQuery={searchQuery}
              onSearchQueryChange={onSearchQueryChange}
              searchResultsCount={searchResultsCount}
              filterMode={filterMode}
              onFilterModeChange={onFilterModeChange}
            />
            {searchQuery ? (
              <ScrollArea className="h-[calc(100vh-420px)] min-h-[360px] pr-4">
                {INI_CATEGORIES.map(category => {
                  const settings = filteredIniSettings[category.id] || []
                  if (settings.length === 0) return null
                  return (
                    <div key={category.id} className="mb-5">
                      <div className="sticky top-0 z-10 -mx-1 mb-2 flex items-baseline gap-2 bg-card/95 px-1 py-1.5 backdrop-blur">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{category.label}</span>
                        <span className="text-[10px] text-muted-foreground/70">{settings.length} match{settings.length === 1 ? '' : 'es'}</span>
                      </div>
                      <div className="space-y-1">
                        {settings.map(setting => (
                          <IniSettingRow
                            key={setting.key}
                            setting={setting}
                            value={iniSettings[setting.key] || ''}
                            originalValue={originalIniSettings[setting.key]}
                            onChange={updateIniValue}
                            onReset={resetIniValue}
                            onBrowse={onBrowse}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
                {searchResultsCount === 0 && (
                  <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                    No settings match &ldquo;{searchQuery}&rdquo;.
                  </div>
                )}
              </ScrollArea>
            ) : (
              <div className="grid gap-0 md:grid-cols-[252px_minmax(0,1fr)]">
                <CategoryRail
                  navAriaLabel="Server settings categories"
                  groupKeyPrefix="ini"
                  categories={INI_CATEGORIES}
                  categoryGroups={INI_CATEGORY_GROUPS}
                  countByCategory={countByCategory}
                  modifiedByCategory={iniModifiedByCategory}
                  filterMode={filterMode}
                  activeCategory={activeIniCategory}
                  onActiveCategoryChange={setActiveIniCategory}
                  collapsedGroups={collapsedGroups}
                  toggleGroup={toggleGroup}
                  allCollapsed={allCollapsed}
                  onToggleAllCollapsed={onToggleAllCollapsed}
                  uncategorizedCount={uncategorizedIniKeys.length}
                  uncategorizedLabel="Uncategorized / Unknown"
                  uncategorizedTooltip="Keys present in your INI file but not in the schema (newer vanilla keys, mod-injected keys, or custom)"
                />
                <ScrollArea className="h-[calc(100vh-420px)] min-h-[360px] md:pl-5 pr-4">
                  {activeIniCategory === 'uncategorized' ? (
                    <IniUncategorizedPanel entries={uncategorizedIniKeys} originalIniSettings={originalIniSettings} onChange={updateIniValue} />
                  ) : (() => {
                    const settings = filteredIniSettings[activeIniCategory] || []
                    const active = INI_CATEGORIES.find(c => c.id === activeIniCategory)
                    if (settings.length === 0) {
                      return (
                        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                          {filterMode === 'modified' ? 'No settings in this category differ from Project Zomboid defaults.' :
                           filterMode === 'nondefault' ? 'No unsaved settings in this category.' :
                           'No settings in this category.'}
                        </div>
                      )
                    }
                    return (
                      <div>
                        <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-baseline justify-between border-b border-border/50 bg-card/95 px-1 pb-2 pt-1 backdrop-blur">
                          <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">{active?.label}</h3>
                          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{settings.length} setting{settings.length === 1 ? '' : 's'}</span>
                        </div>
                        <div className="space-y-1">
                          {settings.map(setting => (
                            <IniSettingRow
                              key={setting.key}
                              setting={setting}
                              value={iniSettings[setting.key] || ''}
                              originalValue={originalIniSettings[setting.key]}
                              onChange={updateIniValue}
                              onReset={resetIniValue}
                              onBrowse={onBrowse}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </ScrollArea>
              </div>
            )}
          </div>
        )}
      </div>
    </TacticalPanel>
  )
}
