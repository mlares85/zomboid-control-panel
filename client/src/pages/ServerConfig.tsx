import { useMemo, useState } from 'react'
import { AlertCircle, RefreshCw, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs } from '@/components/ui/tabs'
import { PageHeader } from '@/components/PageHeader'
import { EditorMode } from '@/lib/serverConfigTypes'
import { useServerConfigLoader, RawFileType } from '@/hooks/serverConfig/useServerConfigLoader'
import { useSearchAndFilter } from '@/hooks/serverConfig/useSearchAndFilter'
import { useCategoryRailState } from '@/hooks/serverConfig/useCategoryRailState'
import { useIniConfig } from '@/hooks/serverConfig/useIniConfig'
import { useSandboxConfig } from '@/hooks/serverConfig/useSandboxConfig'
import { useModSettings } from '@/hooks/serverConfig/useModSettings'
import { useFileBrowser } from '@/hooks/serverConfig/useFileBrowser'
import { useConfigBackups } from '@/hooks/serverConfig/useConfigBackups'
import { useConfigTemplates } from '@/hooks/serverConfig/useConfigTemplates'
import { useSpawnConfig } from '@/hooks/serverConfig/useSpawnConfig'
import { useServerConfigShortcuts } from '@/hooks/serverConfig/useServerConfigShortcuts'
import { ServerConfigLoadingSkeleton } from '@/components/serverConfig/ServerConfigLoadingSkeleton'
import { ServerConfigHeaderActions } from '@/components/serverConfig/ServerConfigHeaderActions'
import { ActiveServerStrip } from '@/components/serverConfig/ActiveServerStrip'
import { ServerConfigTabsList } from '@/components/serverConfig/ServerConfigTabsList'
import { ServerConfigTabPanels } from '@/components/serverConfig/ServerConfigTabPanels'
import { ServerConfigDialogs } from '@/components/serverConfig/ServerConfigDialogs'
import { StickySaveBar } from '@/components/serverConfig/StickySaveBar'

const RAW_TYPE_BY_TAB: Record<string, RawFileType> = {
  ini: 'ini', sandbox: 'sandbox', spawnpoints: 'spawnpoints', spawnregions: 'spawnregions',
}

export default function ServerConfig() {
  const [activeTab, setActiveTab] = useState('ini')
  const [saving, setSaving] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>('structured')

  const loader = useServerConfigLoader()
  const search = useSearchAndFilter()
  const rail = useCategoryRailState()
  const modSettings = useModSettings(activeTab)
  const fileBrowser = useFileBrowser({ iniSettings: loader.iniSettings, setIniSettings: loader.setIniSettings })
  const backups = useConfigBackups(loader.loadData)
  const templates = useConfigTemplates(loader.loadData)

  const ini = useIniConfig({
    iniSettings: loader.iniSettings, setIniSettings: loader.setIniSettings,
    originalIniSettings: loader.originalIniSettings, setOriginalIniSettings: loader.setOriginalIniSettings,
    editorMode, isActiveTab: activeTab === 'ini',
    rawContent: loader.rawContent, originalRawContent: loader.originalRawContent, setOriginalRawContent: loader.setOriginalRawContent,
    deferredSearchQuery: search.deferredSearchQuery, filterMode: search.filterMode,
    reloadAll: loader.loadData, setSaving,
  })

  const sandbox = useSandboxConfig({
    sandboxData: loader.sandboxData, setSandboxData: loader.setSandboxData,
    originalSandboxData: loader.originalSandboxData, setOriginalSandboxData: loader.setOriginalSandboxData,
    editorMode, isActiveTab: activeTab === 'sandbox',
    rawContent: loader.rawContent, originalRawContent: loader.originalRawContent, setOriginalRawContent: loader.setOriginalRawContent,
    deferredSearchQuery: search.deferredSearchQuery, filterMode: search.filterMode,
    reloadAll: loader.loadData, setSaving,
  })

  const spawn = useSpawnConfig({
    spawnPoints: loader.spawnPoints, spawnRegions: loader.spawnRegions,
    editorMode, rawContent: loader.rawContent, reloadAll: loader.loadData, setSaving,
  })

  useServerConfigShortcuts({
    activeTab, hasIniChanges: ini.hasIniChanges, hasSandboxChanges: sandbox.hasSandboxChanges,
    handleSaveIni: ini.handleSaveIni, handleSaveSandbox: sandbox.handleSaveSandbox,
  })

  const searchResultsCount = useMemo(() => {
    if (!search.deferredSearchQuery) return 0
    if (activeTab === 'ini') return Object.values(ini.filteredIniSettings).reduce((acc, s) => acc + s.length, 0)
    if (activeTab === 'sandbox') return Object.values(sandbox.filteredSandboxSettings).reduce((acc, s) => acc + s.length, 0)
    return 0
  }, [search.deferredSearchQuery, activeTab, ini.filteredIniSettings, sandbox.filteredSandboxSettings])

  const resetToStructured = () => setEditorMode('structured')

  const switchToRaw = (type: RawFileType) => {
    setEditorMode('raw')
    loader.loadRawContent(type, resetToStructured)
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    if (editorMode === 'raw') loader.loadRawContent(RAW_TYPE_BY_TAB[value] || 'ini', resetToStructured)
  }

  if (loader.loading) return <ServerConfigLoadingSkeleton />

  const spawnPointsCount = Object.values(loader.spawnPoints).reduce((acc, points) => acc + points.length, 0)

  return (
    <div className="space-y-4 page-transition pb-24">
      {loader.loadError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Configuration data could not be fully loaded</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0 break-words" dir="auto" title={loader.loadError}>{loader.loadError}</span>
            <Button variant="outline" size="sm" onClick={loader.loadData} className="self-start">
              <RefreshCw className="mr-2 h-4 w-4" /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <PageHeader
        title="Server Configuration"
        description="Edit the live INI, sandbox, spawn, and mod settings for this server."
        eyebrow="config"
        tone="config"
        icon={<Settings className="h-5 w-5 text-primary" />}
        actions={
          <ServerConfigHeaderActions
            hasUnsavedChanges={ini.hasIniChanges || sandbox.hasSandboxChanges}
            onOpenTemplates={templates.loadTemplates}
            onOpenBackups={backups.loadBackups}
            onRefresh={loader.loadData}
          />
        }
      />

      <ActiveServerStrip
        pathsInfo={loader.pathsInfo}
        iniSettingsCount={Object.keys(loader.iniSettings).length}
        sandboxSettingsCount={loader.sandboxData ? Object.keys(loader.sandboxData.settings || {}).length : 0}
        spawnPointsCount={spawnPointsCount}
        professionsCount={Object.keys(loader.spawnPoints).length}
        spawnRegionsCount={loader.spawnRegions.length}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <ServerConfigTabsList
          activeTab={activeTab}
          hasIniChanges={ini.hasIniChanges}
          hasSandboxChanges={sandbox.hasSandboxChanges}
          changedIniCount={ini.changedIniCount}
          changedSandboxCount={sandbox.changedSandboxCount}
          modifiedModSettingsCount={modSettings.modifiedModSettingsCount}
          iniMissing={!loader.pathsInfo?.exists.ini}
          sandboxMissing={!loader.pathsInfo?.exists.sandbox}
        />
        <ServerConfigTabPanels
          loader={loader} ini={ini} sandbox={sandbox} modSettings={modSettings}
          search={search} rail={rail} spawn={spawn} fileBrowser={fileBrowser}
          editorMode={editorMode} setEditorMode={setEditorMode} saving={saving}
          switchToRaw={switchToRaw} searchResultsCount={searchResultsCount}
        />
      </Tabs>

      {((activeTab === 'ini' && ini.hasIniChanges) || (activeTab === 'sandbox' && sandbox.hasSandboxChanges)) && (
        <StickySaveBar
          activeTab={activeTab as 'ini' | 'sandbox'}
          changedCount={activeTab === 'ini' ? ini.changedIniCount : sandbox.changedSandboxCount}
          saving={saving}
          onDiscard={activeTab === 'ini' ? ini.discardIniChanges : sandbox.discardSandboxChanges}
          onSave={activeTab === 'ini' ? ini.handleSaveIni : sandbox.handleSaveSandbox}
        />
      )}

      <ServerConfigDialogs backups={backups} templates={templates} fileBrowser={fileBrowser} />
    </div>
  )
}
