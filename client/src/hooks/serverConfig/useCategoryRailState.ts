import { useCallback, useEffect, useMemo, useState } from 'react'
import { INI_CATEGORY_GROUPS, SANDBOX_CATEGORY_GROUPS } from '@/lib/serverConfigSchema'

// Collapsible rail groups shared by the INI and Sandbox tabs — keyed as
// "ini:<groupId>" / "sandbox:<groupId>" so one state object covers both.
export function useCategoryRailState() {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('serverconfig-collapsed-groups')
      if (stored) return JSON.parse(stored) as Record<string, boolean>
    } catch { /* ignore */ }
    return {}
  })
  useEffect(() => {
    try { localStorage.setItem('serverconfig-collapsed-groups', JSON.stringify(collapsedGroups)) } catch { /* ignore */ }
  }, [collapsedGroups])

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const setAllGroupsCollapsed = useCallback((prefix: 'ini' | 'sandbox', collapsed: boolean) => {
    const groups = prefix === 'ini' ? INI_CATEGORY_GROUPS : SANDBOX_CATEGORY_GROUPS
    setCollapsedGroups(prev => {
      const next = { ...prev }
      for (const g of groups) next[`${prefix}:${g.id}`] = collapsed
      return next
    })
  }, [])

  const iniAllCollapsed = useMemo(
    () => INI_CATEGORY_GROUPS.every(g => !!collapsedGroups[`ini:${g.id}`]),
    [collapsedGroups]
  )
  const sandboxAllCollapsed = useMemo(
    () => SANDBOX_CATEGORY_GROUPS.every(g => !!collapsedGroups[`sandbox:${g.id}`]),
    [collapsedGroups]
  )

  return { collapsedGroups, toggleGroup, setAllGroupsCollapsed, iniAllCollapsed, sandboxAllCollapsed }
}
