import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, FileText, Map, MapPin, Puzzle, Settings } from 'lucide-react'

export function ServerConfigTabsList({
  activeTab,
  hasIniChanges,
  hasSandboxChanges,
  changedIniCount,
  changedSandboxCount,
  modifiedModSettingsCount,
  iniMissing,
  sandboxMissing,
}: {
  activeTab: string
  hasIniChanges: boolean
  hasSandboxChanges: boolean
  changedIniCount: number
  changedSandboxCount: number
  modifiedModSettingsCount: number
  iniMissing: boolean
  sandboxMissing: boolean
}) {
  const tabs = [
    { value: 'ini', label: 'Server Settings', icon: Settings, dirty: hasIniChanges, count: changedIniCount, missing: iniMissing },
    { value: 'sandbox', label: 'Sandbox', icon: FileText, dirty: hasSandboxChanges, count: changedSandboxCount, missing: sandboxMissing },
    { value: 'spawnpoints', label: 'Spawn Points', icon: MapPin, dirty: false, count: 0, missing: false },
    { value: 'spawnregions', label: 'Spawn Regions', icon: Map, dirty: false, count: 0, missing: false },
    { value: 'modsettings', label: 'Mod Settings', icon: Puzzle, dirty: false, count: modifiedModSettingsCount, missing: false },
  ] as const

  return (
    <TabsList className="flex h-auto flex-wrap gap-1 bg-muted/30 border border-border/50 p-1 rounded-md w-full">
      {tabs.map((t) => (
        <TabsTrigger
          key={t.value}
          value={t.value}
          className="flex-1 min-w-[120px] flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none"
        >
          <t.icon className="w-4 h-4 shrink-0" />
          {t.label}
          {t.count > 0 && (
            <Badge variant="warning" className="h-5 px-1.5 py-0 font-mono text-[10px] leading-none">
              {t.count}
            </Badge>
          )}
          {t.dirty && activeTab !== t.value && (
            <span className="h-1.5 w-1.5 rounded-full bg-warning motion-safe:animate-pulse" aria-label="unsaved changes" />
          )}
          {t.missing && <AlertCircle className="w-4 h-4 text-warning" aria-label="file missing" />}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}
