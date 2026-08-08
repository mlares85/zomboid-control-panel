import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight, Filter, Search, X } from 'lucide-react'
import { RefObject } from 'react'

interface ModGroupLike { name: string }

export function ModSettingsToolbar({
  searchRef,
  modSettingsSearch,
  setModSettingsSearch,
  modSettingsModifiedOnly,
  setModSettingsModifiedOnly,
  modifiedModSettingsCount,
  filteredModGroups,
  expandedModGroups,
  setExpandedModGroups,
}: {
  searchRef: RefObject<HTMLInputElement>
  modSettingsSearch: string
  setModSettingsSearch: (v: string) => void
  modSettingsModifiedOnly: boolean
  setModSettingsModifiedOnly: (fn: (v: boolean) => boolean) => void
  modifiedModSettingsCount: number
  filteredModGroups: ModGroupLike[]
  expandedModGroups: Set<string>
  setExpandedModGroups: (v: Set<string>) => void
}) {
  const allVisible = filteredModGroups.length > 0 && filteredModGroups.every(g => expandedModGroups.has(g.name))

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={searchRef}
          placeholder="Search mod settings…  (press /)"
          value={modSettingsSearch}
          onChange={(e) => setModSettingsSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setModSettingsSearch(''); e.currentTarget.blur() } }}
          className="pl-9 pr-8"
          maxLength={200}
        />
        {modSettingsSearch && (
          <button
            onClick={() => setModSettingsSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <Button
        variant={modSettingsModifiedOnly ? 'default' : 'outline'}
        size="sm"
        onClick={() => setModSettingsModifiedOnly(v => !v)}
        disabled={modifiedModSettingsCount === 0 && !modSettingsModifiedOnly}
        className="shrink-0 h-9 gap-1.5 text-xs font-medium"
        aria-pressed={modSettingsModifiedOnly}
        title={modifiedModSettingsCount === 0 ? 'No options differ from default' : 'Show only options changed from default'}
      >
        <Filter className="w-3.5 h-3.5" />
        modified
        {modifiedModSettingsCount > 0 && (
          <Badge variant={modSettingsModifiedOnly ? 'secondary' : 'warning'} className="ml-0.5 h-4 px-1.5 py-0 text-xs">
            {modifiedModSettingsCount}
          </Badge>
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpandedModGroups(allVisible ? new Set() : new Set(filteredModGroups.map(g => g.name)))}
        className="shrink-0 gap-1.5 text-xs font-medium"
      >
        {allVisible ? (
          <><ChevronDown className="w-3.5 h-3.5" /> Collapse all</>
        ) : (
          <><ChevronRight className="w-3.5 h-3.5" /> expand all</>
        )}
      </Button>
    </div>
  )
}
