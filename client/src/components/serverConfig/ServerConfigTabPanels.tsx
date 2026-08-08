import { TabsContent } from '@/components/ui/tabs'
import { IniSettingsTab } from './IniSettingsTab'
import { SandboxSettingsTab } from './SandboxSettingsTab'
import { SpawnPointsTab } from './SpawnPointsTab'
import { SpawnRegionsTab } from './SpawnRegionsTab'
import { ModSettingsTab } from './ModSettingsTab'
import { EditorMode } from '@/lib/serverConfigTypes'
import { RawFileType, useServerConfigLoader } from '@/hooks/serverConfig/useServerConfigLoader'
import { useIniConfig } from '@/hooks/serverConfig/useIniConfig'
import { useSandboxConfig } from '@/hooks/serverConfig/useSandboxConfig'
import { useModSettings } from '@/hooks/serverConfig/useModSettings'
import { useSearchAndFilter } from '@/hooks/serverConfig/useSearchAndFilter'
import { useCategoryRailState } from '@/hooks/serverConfig/useCategoryRailState'
import { useSpawnConfig } from '@/hooks/serverConfig/useSpawnConfig'
import { useFileBrowser } from '@/hooks/serverConfig/useFileBrowser'

// The five tab bodies. Split from the page shell so ServerConfig.tsx stays a
// thin composition root — everything here just threads hook state to views.
export function ServerConfigTabPanels({
  loader, ini, sandbox, modSettings, search, rail, spawn, fileBrowser,
  editorMode, setEditorMode, saving, switchToRaw, searchResultsCount,
}: {
  loader: ReturnType<typeof useServerConfigLoader>
  ini: ReturnType<typeof useIniConfig>
  sandbox: ReturnType<typeof useSandboxConfig>
  modSettings: ReturnType<typeof useModSettings>
  search: ReturnType<typeof useSearchAndFilter>
  rail: ReturnType<typeof useCategoryRailState>
  spawn: ReturnType<typeof useSpawnConfig>
  fileBrowser: ReturnType<typeof useFileBrowser>
  editorMode: EditorMode
  setEditorMode: (mode: EditorMode) => void
  saving: boolean
  switchToRaw: (type: RawFileType) => void
  searchResultsCount: number
}) {
  const toStructured = () => setEditorMode('structured')

  return (
    <>
      <TabsContent value="ini" className="mt-4">
        <IniSettingsTab
          ini={ini}
          iniSettings={loader.iniSettings}
          originalIniSettings={loader.originalIniSettings}
          editorMode={editorMode}
          onStructured={toStructured}
          onRaw={() => switchToRaw('ini')}
          rawContent={loader.rawContent}
          onRawContentChange={loader.setRawContent}
          copied={loader.copied}
          onCopyRaw={loader.handleCopyRaw}
          onDownloadBackup={() => loader.handleCreateBackup('ini')}
          saving={saving}
          searchQuery={search.searchQuery}
          onSearchQueryChange={search.setSearchQuery}
          filterMode={search.filterMode}
          onFilterModeChange={search.setFilterMode}
          searchResultsCount={searchResultsCount}
          collapsedGroups={rail.collapsedGroups}
          toggleGroup={rail.toggleGroup}
          onToggleAllCollapsed={() => rail.setAllGroupsCollapsed('ini', !rail.iniAllCollapsed)}
          allCollapsed={rail.iniAllCollapsed}
          onBrowse={fileBrowser.openFileBrowser}
        />
      </TabsContent>

      <TabsContent value="sandbox" className="mt-4">
        <SandboxSettingsTab
          sandbox={sandbox}
          sandboxData={loader.sandboxData}
          originalSandboxData={loader.originalSandboxData}
          editorMode={editorMode}
          onStructured={toStructured}
          onRaw={() => switchToRaw('sandbox')}
          rawContent={loader.rawContent}
          onRawContentChange={loader.setRawContent}
          copied={loader.copied}
          onCopyRaw={loader.handleCopyRaw}
          onDownloadBackup={() => loader.handleCreateBackup('sandbox')}
          saving={saving}
          searchQuery={search.searchQuery}
          onSearchQueryChange={search.setSearchQuery}
          filterMode={search.filterMode}
          onFilterModeChange={search.setFilterMode}
          searchResultsCount={searchResultsCount}
          collapsedGroups={rail.collapsedGroups}
          toggleGroup={rail.toggleGroup}
          onToggleAllCollapsed={() => rail.setAllGroupsCollapsed('sandbox', !rail.sandboxAllCollapsed)}
          allCollapsed={rail.sandboxAllCollapsed}
        />
      </TabsContent>

      <TabsContent value="spawnpoints" className="mt-4">
        <SpawnPointsTab
          editorMode={editorMode}
          onStructured={toStructured}
          onRaw={() => switchToRaw('spawnpoints')}
          rawContent={loader.rawContent}
          onRawContentChange={loader.setRawContent}
          copied={loader.copied}
          onCopyRaw={loader.handleCopyRaw}
          onDownloadBackup={() => loader.handleCreateBackup('spawnpoints')}
          onSave={spawn.handleSaveSpawnPoints}
          saving={saving}
        />
      </TabsContent>

      <TabsContent value="spawnregions" className="mt-4">
        <SpawnRegionsTab
          editorMode={editorMode}
          onStructured={toStructured}
          onRaw={() => switchToRaw('spawnregions')}
          rawContent={loader.rawContent}
          onRawContentChange={loader.setRawContent}
          spawnRegions={loader.spawnRegions}
          setSpawnRegions={loader.setSpawnRegions}
          onDownloadBackup={() => loader.handleCreateBackup('spawnregions')}
          onSave={spawn.handleSaveSpawnRegions}
          saving={saving}
        />
      </TabsContent>

      <TabsContent value="modsettings" className="mt-4">
        <ModSettingsTab modSettings={modSettings} />
      </TabsContent>
    </>
  )
}
