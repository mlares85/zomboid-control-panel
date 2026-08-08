import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { CategoryIcon } from './CategoryIcon'
import { FilterMode } from '@/lib/serverConfigTypes'

export interface RailCategory {
  id: string
  label: string
  icon: string
  group: string
}

export interface RailCategoryGroup {
  id: string
  label: string
}

// Vertical category nav (grouped, collapsible) shared by the INI and Sandbox
// tabs — the two schemas differ but the rail behavior is identical.
export function CategoryRail({
  navAriaLabel,
  groupKeyPrefix,
  categories,
  categoryGroups,
  countByCategory,
  modifiedByCategory,
  filterMode,
  activeCategory,
  onActiveCategoryChange,
  collapsedGroups,
  toggleGroup,
  allCollapsed,
  onToggleAllCollapsed,
  uncategorizedCount,
  uncategorizedLabel,
  uncategorizedTooltip,
}: {
  navAriaLabel: string
  groupKeyPrefix: 'ini' | 'sandbox'
  categories: readonly RailCategory[]
  categoryGroups: readonly RailCategoryGroup[]
  countByCategory: Record<string, number>
  modifiedByCategory: Record<string, number>
  filterMode: FilterMode
  activeCategory: string
  onActiveCategoryChange: (id: string) => void
  collapsedGroups: Record<string, boolean>
  toggleGroup: (key: string) => void
  allCollapsed: boolean
  onToggleAllCollapsed: () => void
  uncategorizedCount: number
  uncategorizedLabel: string
  uncategorizedTooltip: string
}) {
  return (
    <nav
      aria-label={navAriaLabel}
      className="-mx-2 flex gap-0.5 overflow-x-auto px-2 pb-2 md:mx-0 md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-r md:border-border/50 md:pb-0 md:pr-3 md:pt-1 md:max-h-[calc(100vh-420px)] md:min-h-[360px]"
    >
      <div className="hidden md:flex items-center justify-between px-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          Categories
        </span>
        <button
          type="button"
          onClick={onToggleAllCollapsed}
          className="inline-flex items-center gap-1 rounded text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 hover:text-foreground transition-colors"
          aria-label={allCollapsed ? 'Expand all category groups' : 'Collapse all category groups'}
        >
          {allCollapsed
            ? <ChevronsUpDown className="h-3 w-3" />
            : <ChevronsDownUp className="h-3 w-3" />}
          <span>{allCollapsed ? 'Expand all' : 'Collapse all'}</span>
        </button>
      </div>
      {categoryGroups.map((group, gIdx) => {
        const cats = categories.filter(c => c.group === group.id)
        // Hide whole group if every category is empty under current filter
        const totalInGroup = cats.reduce((acc, c) => acc + (countByCategory[c.id] || 0), 0)
        if (totalInGroup === 0 && filterMode !== 'all') return null
        const groupKey = `${groupKeyPrefix}:${group.id}`
        const isCollapsed = !!collapsedGroups[groupKey]
        const groupModCount = cats.reduce((acc, c) => acc + (modifiedByCategory[c.id] || 0), 0)
        return (
          <div key={group.id} className={gIdx > 0 ? 'mt-2 md:mt-3' : ''}>
            <button
              type="button"
              onClick={() => toggleGroup(groupKey)}
              aria-expanded={!isCollapsed}
              className="hidden md:flex w-full items-center gap-2 px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-foreground/80 hover:text-foreground transition-colors"
            >
              {isCollapsed
                ? <ChevronRight className="h-3 w-3 shrink-0" />
                : <ChevronDown className="h-3 w-3 shrink-0" />
              }
              <span>{group.label}</span>
              {groupModCount > 0 && (
                <span className="rounded-full bg-warning/20 px-1.5 py-0.5 text-[8px] font-semibold text-warning">{groupModCount}</span>
              )}
              <span className="h-px flex-1 bg-border/40" />
            </button>
            {!isCollapsed && cats.map(category => {
              const count = countByCategory[category.id] || 0
              if (count === 0 && filterMode !== 'all') return null
              const isActive = activeCategory === category.id
              const modCount = modifiedByCategory[category.id] || 0
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => onActiveCategoryChange(category.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group relative flex shrink-0 items-center gap-2 whitespace-nowrap border-l-2 px-3 py-2 text-left text-sm transition-colors md:whitespace-normal ${
                    isActive
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-transparent text-muted-foreground hover:border-primary/30 hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <CategoryIcon name={category.icon} isActive={isActive} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-medium">{category.label}</span>
                  {modCount > 0 && (
                    <span
                      className="shrink-0 rounded-full bg-warning/20 px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-wider text-warning"
                      title={`${modCount} unsaved change${modCount === 1 ? '' : 's'}`}
                    >
                      {modCount}
                    </span>
                  )}
                  <span className={`shrink-0 min-w-[1.5rem] rounded text-center px-1 py-0.5 text-[10px] font-mono tabular-nums ${
                    isActive ? 'text-primary/80' : 'bg-muted text-muted-foreground'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        )
      })}
      {uncategorizedCount > 0 && (() => {
        const isActive = activeCategory === 'uncategorized'
        return (
          <button
            key="uncategorized"
            type="button"
            onClick={() => onActiveCategoryChange('uncategorized')}
            aria-current={isActive ? 'page' : undefined}
            className={`group relative mt-2 flex shrink-0 items-center gap-2 whitespace-nowrap border-l-2 px-3 py-2 text-left text-sm transition-colors md:mt-3 md:whitespace-normal md:border-t md:border-t-border/50 md:pt-3 ${
              isActive
                ? 'border-l-amber-500 bg-amber-500/10 text-amber-500'
                : 'border-l-transparent text-muted-foreground hover:border-l-amber-500/30 hover:bg-amber-500/5 hover:text-amber-500/80'
            }`}
            title={uncategorizedTooltip}
          >
            <span className="min-w-0 flex-1 truncate font-medium">{uncategorizedLabel}</span>
            <span className={`shrink-0 min-w-[1.5rem] rounded text-center px-1 py-0.5 text-[10px] font-mono tabular-nums ${
              isActive ? 'text-amber-500/80' : 'bg-muted text-muted-foreground'
            }`}>
              {uncategorizedCount}
            </span>
          </button>
        )
      })()}
    </nav>
  )
}
