import { useDeferredValue, useEffect, useState } from 'react'
import { FilterMode } from '@/lib/serverConfigTypes'

// Search + filter-mode state shared by the INI and Sandbox tabs.
export function useSearchAndFilter() {
  const [searchQuery, setSearchQuery] = useState('')
  // Defer the search value so each keystroke doesn't re-filter the full schema
  // synchronously — keeps the input snappy on slower machines.
  const deferredSearchQuery = useDeferredValue(searchQuery)

  const [filterMode, setFilterMode] = useState<FilterMode>(() => {
    try {
      const stored = localStorage.getItem('serverconfig-filter-mode')
      // Before this migration, "nondefault" represented settings changed from PZ defaults.
      if (stored === 'nondefault') return 'modified'
      if (stored === 'modified' || stored === 'nondefault' || stored === 'all') return stored
    } catch { /* ignore */ }
    return 'all'
  })
  useEffect(() => { try { localStorage.setItem('serverconfig-filter-mode', filterMode) } catch { /* ignore */ } }, [filterMode])

  return { searchQuery, setSearchQuery, deferredSearchQuery, filterMode, setFilterMode }
}
