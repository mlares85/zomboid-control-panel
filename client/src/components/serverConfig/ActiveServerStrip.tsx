import { FileText, FolderOpen, Map, MapPin, Settings } from 'lucide-react'
import { TacticalPanel } from './ConfigPanels'
import { StatChip } from './StatChip'
import { ServerConfigPaths } from '@/hooks/serverConfig/useServerConfigLoader'

export function ActiveServerStrip({
  pathsInfo,
  iniSettingsCount,
  sandboxSettingsCount,
  spawnPointsCount,
  professionsCount,
  spawnRegionsCount,
}: {
  pathsInfo: ServerConfigPaths | null
  iniSettingsCount: number
  sandboxSettingsCount: number
  spawnPointsCount: number
  professionsCount: number
  spawnRegionsCount: number
}) {
  return (
    <TacticalPanel tone="primary">
      <div className="px-3 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground whitespace-nowrap">
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Active server</span>
          </div>
          {pathsInfo ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold text-foreground">{pathsInfo.serverName}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={pathsInfo.configPath} dir="ltr">
                {pathsInfo.configPath}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/60">No server selected</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-muted-foreground">
          <StatChip icon={<Settings className="h-3 w-3" />} value={iniSettingsCount} label="INI" ok={pathsInfo?.exists.ini} />
          <span className="h-3 w-px bg-border/60" aria-hidden />
          <StatChip icon={<FileText className="h-3 w-3" />} value={sandboxSettingsCount} label="Sandbox" ok={pathsInfo?.exists.sandbox} />
          <span className="h-3 w-px bg-border/60" aria-hidden />
          <StatChip
            icon={<MapPin className="h-3 w-3" />}
            value={spawnPointsCount}
            label={`Spawns · ${professionsCount} prof${professionsCount === 1 ? '' : 's'}`}
          />
          <span className="h-3 w-px bg-border/60" aria-hidden />
          <StatChip icon={<Map className="h-3 w-3" />} value={spawnRegionsCount} label="Regions" />
        </div>
      </div>
    </TacticalPanel>
  )
}
