import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'
import { FilterMode } from '@/lib/serverConfigTypes'

// Scoped search + filter mode bar shared by the INI and Sandbox tabs.
export function SettingsSearchFilterBar({
  placeholder,
  ariaLabel,
  searchQuery,
  onSearchQueryChange,
  searchResultsCount,
  filterMode,
  onFilterModeChange,
}: {
  placeholder: string
  ariaLabel: string
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  searchResultsCount: number
  filterMode: FilterMode
  onFilterModeChange: (mode: FilterMode) => void
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="relative min-w-0 flex-1 sm:max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          className="h-8 bg-background/50 pl-9 pr-20"
          aria-label={ariaLabel}
          maxLength={128}
        />
        {searchQuery && (
          <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {searchResultsCount}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="pointer-events-auto h-6 w-6 p-0"
              onClick={() => onSearchQueryChange('')}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div className="inline-flex items-center rounded-md border border-border/60 bg-background/50 p-0.5" role="group" aria-label="Filter settings">
          {(['all', 'modified', 'nondefault'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => onFilterModeChange(mode)}
              className={`h-7 px-2.5 text-xs font-medium rounded transition-colors ${
                filterMode === mode
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {mode === 'nondefault' ? 'unsaved' : mode}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
