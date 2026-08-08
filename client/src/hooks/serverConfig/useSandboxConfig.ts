import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { getUserErrorMessage } from '@/lib/errorMessage'
import { serverFilesApi, SandboxData } from '@/lib/api'
import { SANDBOX_SCHEMA, groupByCategory, SandboxSetting } from '@/lib/serverConfigSchema'
import { EditorMode, FilterMode, SandboxRecord, SandboxScalar } from '@/lib/serverConfigTypes'

// Owns everything the Sandbox tab needs beyond raw file loading: per-setting
// modified/default tracking, category filtering, uncategorized keys, and save.
export function useSandboxConfig(params: {
  sandboxData: SandboxData | null
  setSandboxData: Dispatch<SetStateAction<SandboxData | null>>
  originalSandboxData: SandboxData | null
  setOriginalSandboxData: Dispatch<SetStateAction<SandboxData | null>>
  editorMode: EditorMode
  isActiveTab: boolean
  rawContent: string
  originalRawContent: string
  setOriginalRawContent: Dispatch<SetStateAction<string>>
  deferredSearchQuery: string
  filterMode: FilterMode
  reloadAll: () => Promise<void>
  setSaving: (v: boolean) => void
}) {
  const {
    sandboxData, setSandboxData, originalSandboxData, setOriginalSandboxData,
    editorMode, isActiveTab, rawContent, originalRawContent, setOriginalRawContent,
    deferredSearchQuery, filterMode, reloadAll, setSaving,
  } = params
  const { toast } = useToast()

  const [activeSandboxCategory, setActiveSandboxCategory] = useState<string>(() => {
    try { return localStorage.getItem('serverconfig-sandbox-cat') || 'time' } catch { return 'time' }
  })
  useEffect(() => { try { localStorage.setItem('serverconfig-sandbox-cat', activeSandboxCategory) } catch { /* ignore */ } }, [activeSandboxCategory])

  const hasSandboxChanges = useMemo(() => {
    if (editorMode === 'raw' && isActiveTab) return rawContent !== originalRawContent
    return JSON.stringify(sandboxData) !== JSON.stringify(originalSandboxData)
  }, [editorMode, isActiveTab, rawContent, originalRawContent, sandboxData, originalSandboxData])

  const updateSandboxValue = useCallback((setting: SandboxSetting, value: SandboxScalar) => {
    setSandboxData(prev => {
      if (!prev) return prev
      const section = (setting.section || 'settings') as keyof SandboxData
      const sectionData = { ...(prev[section] as Record<string, unknown> || {}) }
      sectionData[setting.key] = value
      return { ...prev, [section]: sectionData } as SandboxData
    })
  }, [setSandboxData])

  const setUncategorizedSandboxValue = useCallback((section: string, key: string, value: string | number | boolean) => {
    setSandboxData(prev => {
      if (!prev) return prev
      const s = { ...(prev[section as keyof SandboxData] as Record<string, unknown> || {}) }
      s[key] = value
      return { ...prev, [section]: s } as SandboxData
    })
  }, [setSandboxData])

  const discardSandboxChanges = useCallback(() => {
    if (originalSandboxData) setSandboxData(JSON.parse(JSON.stringify(originalSandboxData)))
  }, [originalSandboxData, setSandboxData])

  const resetSandboxValue = useCallback((setting: SandboxSetting) => {
    if (!originalSandboxData || !sandboxData) return
    const section = (setting.section || 'settings') as keyof SandboxData
    const originalSection = originalSandboxData[section] as SandboxRecord | undefined
    if (originalSection && originalSection[setting.key] !== undefined) {
      setSandboxData(prev => {
        if (!prev) return prev
        return { ...prev, [section]: { ...(prev[section] as SandboxRecord), [setting.key]: originalSection[setting.key] } }
      })
    }
  }, [originalSandboxData, sandboxData, setSandboxData])

  const isSandboxModified = useCallback((s: SandboxSetting) => {
    if (!sandboxData || !originalSandboxData) return false
    const section = (s.section || 'settings') as keyof SandboxData
    const curr = (sandboxData[section] as SandboxRecord)?.[s.key]
    const orig = (originalSandboxData[section] as SandboxRecord)?.[s.key]
    return JSON.stringify(curr) !== JSON.stringify(orig)
  }, [sandboxData, originalSandboxData])

  const isSandboxNonDefault = useCallback((s: SandboxSetting) => {
    if (!sandboxData) return false
    const section = (s.section || 'settings') as keyof SandboxData
    const curr = (sandboxData[section] as SandboxRecord)?.[s.key]
    if (curr === undefined || curr === null) return false
    return String(curr) !== String(s.default ?? '')
  }, [sandboxData])

  const filteredSandboxSettings = useMemo(() => {
    const lower = deferredSearchQuery.toLowerCase()
    const filtered = SANDBOX_SCHEMA.filter(s => {
      if (deferredSearchQuery && !(
        s.key.toLowerCase().includes(lower) ||
        s.label.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower)
      )) return false
      if (filterMode === 'modified' && !isSandboxNonDefault(s)) return false
      if (filterMode === 'nondefault' && !isSandboxModified(s)) return false
      return true
    })
    return groupByCategory(filtered)
  }, [deferredSearchQuery, filterMode, isSandboxModified, isSandboxNonDefault])

  const sandboxModifiedByCategory = useMemo(() => {
    const out: Record<string, number> = {}
    for (const s of SANDBOX_SCHEMA) if (isSandboxModified(s)) out[s.category] = (out[s.category] || 0) + 1
    return out
  }, [isSandboxModified])

  const uncategorizedSandboxKeys = useMemo(() => {
    if (!sandboxData) return []
    const schemaKeys = new Set(SANDBOX_SCHEMA.map(s => `${s.section || 'settings'}.${s.key}`))
    const uncategorized: { section: string; key: string; value: string | number | boolean }[] = []
    for (const sectionName of Object.keys(sandboxData)) {
      if (sectionName === 'VERSION') continue
      const sectionData = sandboxData[sectionName as keyof SandboxData]
      if (typeof sectionData !== 'object' || sectionData === null) continue
      for (const [key, value] of Object.entries(sectionData as Record<string, string | number | boolean>)) {
        if (key === 'VERSION') continue
        if (!schemaKeys.has(`${sectionName}.${key}`)) {
          const lower = deferredSearchQuery?.toLowerCase() || ''
          if (!deferredSearchQuery || key.toLowerCase().includes(lower) || String(value).toLowerCase().includes(lower)) {
            uncategorized.push({ section: sectionName, key, value })
          }
        }
      }
    }
    return uncategorized.sort((a, b) => (a.section !== b.section ? a.section.localeCompare(b.section) : a.key.localeCompare(b.key)))
  }, [sandboxData, deferredSearchQuery])

  const uncategorizedGroups = useMemo(() => {
    const groups: Record<string, typeof uncategorizedSandboxKeys> = {}
    for (const entry of uncategorizedSandboxKeys) {
      const list = groups[entry.section] || (groups[entry.section] = [])
      list.push(entry)
    }
    return groups
  }, [uncategorizedSandboxKeys])

  const changedSandboxCount = useMemo(() => {
    if (!sandboxData || !originalSandboxData) return 0
    let count = 0
    SANDBOX_SCHEMA.forEach(setting => {
      const section = (setting.section || 'settings') as keyof SandboxData
      const curr = (sandboxData[section] as SandboxRecord)?.[setting.key]
      const orig = (originalSandboxData[section] as SandboxRecord)?.[setting.key]
      if (JSON.stringify(curr) !== JSON.stringify(orig)) count++
    })
    return count
  }, [sandboxData, originalSandboxData])

  const handleSaveSandbox = useCallback(async () => {
    setSaving(true)
    try {
      if (editorMode === 'raw') {
        await serverFilesApi.saveRaw('sandbox', rawContent)
        setOriginalRawContent(rawContent)
      } else if (sandboxData) {
        const cleanData = JSON.parse(JSON.stringify(sandboxData)) as SandboxData
        SANDBOX_SCHEMA.forEach(setting => {
          if (setting.type !== 'number') return
          const section = (setting.section || 'settings') as keyof SandboxData
          if (!cleanData[section]) return
          const sectionData = cleanData[section] as SandboxRecord
          const raw = sectionData[setting.key]
          if (typeof raw === 'string') {
            const num = parseFloat(raw)
            sectionData[setting.key] = isNaN(num) ? (Number(setting.default) || 0) : num
          }
        })
        await serverFilesApi.saveSandbox(cleanData)
        setSandboxData(cleanData)
        setOriginalSandboxData(cleanData)
      }
      try {
        await serverFilesApi.saveAndReload()
        toast({ title: 'Saved & Reloaded', description: 'Sandbox settings saved and reloaded.' })
      } catch {
        toast({ title: 'Saved', description: 'Settings saved. Restart server to apply changes.' })
      }
      try {
        if (editorMode === 'raw') {
          await reloadAll()
        } else {
          const sandboxRes = await serverFilesApi.getSandbox()
          setSandboxData(sandboxRes.sandbox)
          setOriginalSandboxData(sandboxRes.sandbox)
        }
      } catch { /* silent refresh — local state is still valid */ }
    } catch (error) {
      toast({ title: 'Error', description: getUserErrorMessage(error, 'Failed to save settings.'), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }, [editorMode, rawContent, sandboxData, setOriginalRawContent, setSandboxData, setOriginalSandboxData, reloadAll, toast, setSaving])

  return {
    activeSandboxCategory, setActiveSandboxCategory,
    hasSandboxChanges, updateSandboxValue, setUncategorizedSandboxValue, resetSandboxValue, discardSandboxChanges,
    filteredSandboxSettings, sandboxModifiedByCategory, uncategorizedSandboxKeys, uncategorizedGroups,
    changedSandboxCount, handleSaveSandbox,
  }
}
