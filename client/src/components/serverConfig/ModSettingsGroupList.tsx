import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Filter, Search } from 'lucide-react'
import { formatModSettingLabel } from '@/lib/modSettingsLabels'
import { ModSettingOption } from '@/hooks/serverConfig/useModSettings'
import { ModSettingOptionRow } from './ModSettingOptionRow'

interface ModGroup {
  name: string
  count: number
  filteredOpts: ModSettingOption[]
}

export function ModSettingsGroupList({
  filteredModGroups,
  modSettings,
  expandedModGroups,
  setExpandedModGroups,
  isOptModified,
  savingOptions,
  onOptionChange,
  modSettingsSearch,
  modSettingsModifiedOnly,
  onClearSearch,
  onClearModifiedOnly,
}: {
  filteredModGroups: ModGroup[]
  modSettings: Record<string, ModSettingOption[]>
  expandedModGroups: Set<string>
  setExpandedModGroups: (fn: (prev: Set<string>) => Set<string>) => void
  isOptModified: (opt: { default?: unknown; value?: unknown }) => boolean
  savingOptions: Set<string>
  onOptionChange: (optName: string, newValue: unknown, groupName: string) => void
  modSettingsSearch: string
  modSettingsModifiedOnly: boolean
  onClearSearch: () => void
  onClearModifiedOnly: () => void
}) {
  const isFiltering = !!modSettingsSearch.trim() || modSettingsModifiedOnly

  if (filteredModGroups.length === 0 && isFiltering) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
        {modSettingsModifiedOnly && !modSettingsSearch ? (
          <>
            <Filter className="w-5 h-5 opacity-50" />
            <p className="text-sm">No options have been modified from their defaults.</p>
            <Button variant="ghost" size="sm" onClick={onClearModifiedOnly} className="text-xs">Show all options</Button>
          </>
        ) : (
          <>
            <Search className="w-5 h-5 opacity-50" />
            <p className="text-sm">
              No settings match &ldquo;{modSettingsSearch.length > 60 ? modSettingsSearch.slice(0, 60) + '…' : modSettingsSearch}&rdquo;
              {modSettingsModifiedOnly ? ' in modified options' : ''}
            </p>
            <div className="flex gap-2">
              {modSettingsSearch && <Button variant="ghost" size="sm" onClick={onClearSearch} className="text-xs">Clear search</Button>}
              {modSettingsModifiedOnly && <Button variant="ghost" size="sm" onClick={onClearModifiedOnly} className="text-xs">Show all options</Button>}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      {filteredModGroups.map(group => {
        const isExpanded = isFiltering || expandedModGroups.has(group.name)
        const groupAllOpts = modSettings[group.name] || []
        const groupModifiedCount = groupAllOpts.reduce((c, o) => c + (isOptModified(o) ? 1 : 0), 0)

        return (
          <div key={group.name} className="mb-3">
            <button
              type="button"
              onClick={() => {
                setExpandedModGroups(prev => {
                  const next = new Set(prev)
                  if (next.has(group.name)) next.delete(group.name)
                  else next.add(group.name)
                  return next
                })
              }}
              aria-expanded={isExpanded}
              className={`flex items-center gap-3 w-full py-2.5 px-4 rounded-lg transition-[background-color,border-color,box-shadow,color] duration-200 ${
                isExpanded ? 'border border-primary/30 bg-primary/10 shadow-sm' : 'bg-muted/50 hover:bg-muted border border-transparent'
              }`}
            >
              <div className={`p-1 rounded transition-colors ${isExpanded ? 'bg-primary/20 text-primary' : 'bg-muted'}`}>
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </div>
              <span className={`font-medium truncate min-w-0 ${isExpanded ? 'text-primary' : ''}`} title={formatModSettingLabel(group.name)}>
                {formatModSettingLabel(group.name)}
              </span>
              {groupModifiedCount > 0 && (
                <Badge variant="warning" className="h-5 px-1.5 py-0 text-[10px] font-mono shrink-0" title={`${groupModifiedCount} option${groupModifiedCount === 1 ? '' : 's'} differ from default`}>
                  {groupModifiedCount} mod
                </Badge>
              )}
              <Badge variant={isExpanded ? 'default' : 'secondary'} className="ml-auto">
                {group.filteredOpts.length}
              </Badge>
            </button>
            {isExpanded && (
              <div className="mt-3 ml-4 space-y-1 border-l-2 border-primary/30 pl-4">
                {group.filteredOpts.map((opt, idx) => (
                  <ModSettingOptionRow
                    key={`${opt.name || 'opt'}-${idx}`}
                    opt={opt}
                    idx={idx}
                    groupName={group.name}
                    isSaving={opt.name ? savingOptions.has(opt.name) : false}
                    isModified={isOptModified(opt)}
                    onOptionChange={onOptionChange}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
