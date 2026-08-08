import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertCircle, AlertTriangle, Check, Code, Copy, Download, ExternalLink, Loader2, Save } from 'lucide-react'
import { TacticalPanel, SectionHeader } from './ConfigPanels'
import { EditorModeToggle } from './EditorModeToggle'
import { SettingsSearchFilterBar } from './SettingsSearchFilterBar'
import { CategoryRail } from './CategoryRail'
import { SandboxSettingRow } from './SandboxSettingRow'
import { SandboxUncategorizedPanel } from './SandboxUncategorizedPanel'
import { SANDBOX_CATEGORIES, SANDBOX_CATEGORY_GROUPS } from '@/lib/serverConfigSchema'
import { EditorMode, FilterMode, SandboxRecord } from '@/lib/serverConfigTypes'
import { SandboxData } from '@/lib/api'
import { useSandboxConfig } from '@/hooks/serverConfig/useSandboxConfig'

export function SandboxSettingsTab({
  sandbox,
  sandboxData,
  originalSandboxData,
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
}: {
  sandbox: ReturnType<typeof useSandboxConfig>
  sandboxData: SandboxData | null
  originalSandboxData: SandboxData | null
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
}) {
  const {
    hasSandboxChanges, updateSandboxValue, setUncategorizedSandboxValue, resetSandboxValue,
    changedSandboxCount, handleSaveSandbox, filteredSandboxSettings, sandboxModifiedByCategory,
    uncategorizedSandboxKeys, uncategorizedGroups, activeSandboxCategory, setActiveSandboxCategory,
  } = sandbox

  const countByCategory = Object.fromEntries(SANDBOX_CATEGORIES.map(c => [c.id, (filteredSandboxSettings[c.id] || []).length]))
  const valueFor = (key: string, section?: string) => (sandboxData?.[(section || 'settings') as keyof SandboxData] as SandboxRecord)?.[key]
  const originalFor = (key: string, section?: string) => (originalSandboxData?.[(section || 'settings') as keyof SandboxData] as SandboxRecord)?.[key]

  return (
    <TacticalPanel tone={hasSandboxChanges ? 'warning' : 'primary'}>
      <SectionHeader
        label="Sandbox"
        sublabel="world, zombies, survival"
        icon={Code}
        tone={hasSandboxChanges ? 'warning' : 'primary'}
        action={
          <div className="flex items-center gap-1.5">
            {hasSandboxChanges && (
              <Badge variant="warning" className="h-5 px-1.5 py-0 font-mono text-[10px]">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {changedSandboxCount}
              </Badge>
            )}
            <EditorModeToggle editorMode={editorMode} onStructured={onStructured} onRaw={onRaw} />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={onDownloadBackup} aria-label="Download Sandbox backup">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download Sandbox backup</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <a
              href="https://pzwiki.net/wiki/Sandbox_options"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 items-center gap-1 rounded border border-border/60 bg-muted/30 px-2 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" /> Wiki
            </a>
            <Button onClick={handleSaveSandbox} disabled={saving || !hasSandboxChanges} variant="command" size="sm" className="h-7 gap-1.5 text-xs font-medium">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save &amp; reload
            </Button>
          </div>
        }
      />
      <div className="p-4">
        <Alert className="mb-3 border-primary/30 bg-primary/5">
          <AlertCircle className="h-4 w-4 text-primary" />
          <AlertTitle>Build 42 Optimized</AlertTitle>
          <AlertDescription>
            Sandbox values and option wording in this editor are aligned to Project Zomboid Build 42 defaults.
          </AlertDescription>
        </Alert>
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
              placeholder="Search sandbox settings…"
              ariaLabel="Search sandbox settings"
              searchQuery={searchQuery}
              onSearchQueryChange={onSearchQueryChange}
              searchResultsCount={searchResultsCount}
              filterMode={filterMode}
              onFilterModeChange={onFilterModeChange}
            />
            {searchQuery ? (
              <ScrollArea className="h-[calc(100vh-420px)] min-h-[360px] pr-4">
                {SANDBOX_CATEGORIES.map(category => {
                  const settings = filteredSandboxSettings[category.id] || []
                  if (settings.length === 0) return null
                  return (
                    <div key={category.id} className="mb-5">
                      <div className="sticky top-0 z-10 -mx-1 mb-2 flex items-baseline gap-2 bg-card/95 px-1 py-1.5 backdrop-blur">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{category.label}</span>
                        <span className="text-[10px] text-muted-foreground/70">{settings.length} match{settings.length === 1 ? '' : 'es'}</span>
                      </div>
                      <div className="space-y-1">
                        {settings.map(setting => (
                          <SandboxSettingRow
                            key={`${setting.section || 'settings'}.${setting.key}`}
                            setting={setting}
                            value={valueFor(setting.key, setting.section)}
                            originalValue={originalFor(setting.key, setting.section)}
                            onChange={updateSandboxValue}
                            onReset={resetSandboxValue}
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
                  navAriaLabel="Sandbox categories"
                  groupKeyPrefix="sandbox"
                  categories={SANDBOX_CATEGORIES}
                  categoryGroups={SANDBOX_CATEGORY_GROUPS}
                  countByCategory={countByCategory}
                  modifiedByCategory={sandboxModifiedByCategory}
                  filterMode={filterMode}
                  activeCategory={activeSandboxCategory}
                  onActiveCategoryChange={setActiveSandboxCategory}
                  collapsedGroups={collapsedGroups}
                  toggleGroup={toggleGroup}
                  allCollapsed={allCollapsed}
                  onToggleAllCollapsed={onToggleAllCollapsed}
                  uncategorizedCount={uncategorizedSandboxKeys.length}
                  uncategorizedLabel="Additional Settings"
                  uncategorizedTooltip="Sandbox settings not yet grouped by the editor"
                />
                <ScrollArea className="h-[calc(100vh-420px)] min-h-[360px] md:pl-5 pr-4">
                  {activeSandboxCategory === 'uncategorized' ? (
                    <SandboxUncategorizedPanel
                      entries={uncategorizedSandboxKeys}
                      groups={uncategorizedGroups}
                      originalSandboxData={originalSandboxData}
                      onChange={setUncategorizedSandboxValue}
                    />
                  ) : (() => {
                    const settings = filteredSandboxSettings[activeSandboxCategory] || []
                    const active = SANDBOX_CATEGORIES.find(c => c.id === activeSandboxCategory)
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
                            <SandboxSettingRow
                              key={`${setting.section || 'settings'}.${setting.key}`}
                              setting={setting}
                              value={valueFor(setting.key, setting.section)}
                              originalValue={originalFor(setting.key, setting.section)}
                              onChange={updateSandboxValue}
                              onReset={resetSandboxValue}
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
