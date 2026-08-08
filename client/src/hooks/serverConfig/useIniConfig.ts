import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { getUserErrorMessage } from '@/lib/errorMessage'
import { serverFilesApi } from '@/lib/api'
import { INI_SCHEMA, groupByCategory, IniSetting } from '@/lib/serverConfigSchema'
import { EditorMode, FilterMode, UNSUPPORTED_INI_KEYS, mergeSchemaDefaults } from '@/lib/serverConfigTypes'

// Owns everything the INI tab needs beyond raw file loading: per-setting
// modified/default tracking, category filtering, uncategorized keys, and save.
export function useIniConfig(params: {
  iniSettings: Record<string, string>
  setIniSettings: Dispatch<SetStateAction<Record<string, string>>>
  originalIniSettings: Record<string, string>
  setOriginalIniSettings: Dispatch<SetStateAction<Record<string, string>>>
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
    iniSettings, setIniSettings, originalIniSettings, setOriginalIniSettings,
    editorMode, isActiveTab, rawContent, originalRawContent, setOriginalRawContent,
    deferredSearchQuery, filterMode, reloadAll, setSaving,
  } = params
  const { toast } = useToast()

  const [activeIniCategory, setActiveIniCategory] = useState<string>(() => {
    try { return localStorage.getItem('serverconfig-ini-cat') || 'general' } catch { return 'general' }
  })
  useEffect(() => { try { localStorage.setItem('serverconfig-ini-cat', activeIniCategory) } catch { /* ignore */ } }, [activeIniCategory])

  const hasIniChanges = useMemo(() => {
    if (editorMode === 'raw' && isActiveTab) return rawContent !== originalRawContent
    return JSON.stringify(iniSettings) !== JSON.stringify(originalIniSettings)
  }, [editorMode, isActiveTab, rawContent, originalRawContent, iniSettings, originalIniSettings])

  const updateIniValue = useCallback((key: string, value: string) => {
    setIniSettings(prev => ({ ...prev, [key]: value }))
  }, [setIniSettings])

  const resetIniValue = useCallback((key: string) => {
    if (originalIniSettings[key] !== undefined) {
      setIniSettings(prev => ({ ...prev, [key]: originalIniSettings[key] }))
    }
  }, [originalIniSettings, setIniSettings])

  const discardIniChanges = useCallback(() => {
    setIniSettings({ ...originalIniSettings })
  }, [originalIniSettings, setIniSettings])

  const isIniModified = useCallback((s: IniSetting) => {
    const curr = iniSettings[s.key]
    const orig = originalIniSettings[s.key]
    return curr !== orig && orig !== undefined
  }, [iniSettings, originalIniSettings])

  const isIniNonDefault = useCallback((s: IniSetting) => {
    if (s.defaultComparable === false) return false
    const curr = iniSettings[s.key]
    if (curr === undefined) return false
    return String(curr) !== String(s.default ?? '')
  }, [iniSettings])

  const filteredIniSettings = useMemo(() => {
    const lower = deferredSearchQuery.toLowerCase()
    const filtered = INI_SCHEMA.filter(s => {
      if (deferredSearchQuery && !(
        s.key.toLowerCase().includes(lower) ||
        s.label.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower)
      )) return false
      if (filterMode === 'modified' && !isIniNonDefault(s)) return false
      if (filterMode === 'nondefault' && !isIniModified(s)) return false
      return true
    })
    return groupByCategory(filtered)
  }, [deferredSearchQuery, filterMode, isIniModified, isIniNonDefault])

  const iniModifiedByCategory = useMemo(() => {
    const out: Record<string, number> = {}
    for (const s of INI_SCHEMA) if (isIniModified(s)) out[s.category] = (out[s.category] || 0) + 1
    return out
  }, [isIniModified])

  // Unknown INI keys — keys present in the loaded file but not in the schema.
  const uncategorizedIniKeys = useMemo(() => {
    const schemaKeys = new Set(INI_SCHEMA.map(s => s.key))
    const lower = deferredSearchQuery.toLowerCase()
    const out: { key: string; value: string }[] = []
    for (const [key, value] of Object.entries(iniSettings)) {
      if (schemaKeys.has(key) || UNSUPPORTED_INI_KEYS.has(key)) continue
      if (deferredSearchQuery && !(
        key.toLowerCase().includes(lower) ||
        String(value).toLowerCase().includes(lower)
      )) continue
      out.push({ key, value })
    }
    return out.sort((a, b) => a.key.localeCompare(b.key))
  }, [iniSettings, deferredSearchQuery])

  const changedIniCount = useMemo(() => {
    let count = 0
    for (const key of Object.keys(iniSettings)) {
      if (originalIniSettings[key] !== undefined && iniSettings[key] !== originalIniSettings[key]) count++
    }
    return count
  }, [iniSettings, originalIniSettings])

  const handleSaveIni = useCallback(async () => {
    setSaving(true)
    try {
      if (editorMode === 'raw') {
        await serverFilesApi.saveRaw('ini', rawContent)
        setOriginalRawContent(rawContent)
      } else {
        await serverFilesApi.saveIni(iniSettings)
        setOriginalIniSettings({ ...iniSettings })
      }
      try {
        await serverFilesApi.saveAndReload()
        toast({ title: 'Saved & Reloaded', description: 'Server settings saved and reloaded.' })
      } catch {
        toast({ title: 'Saved', description: 'Settings saved. Restart server to apply changes.' })
      }
      try {
        if (editorMode === 'raw') {
          await reloadAll()
        } else {
          const iniData = await serverFilesApi.getIni()
          const merged = mergeSchemaDefaults(iniData.settings)
          setIniSettings(merged)
          setOriginalIniSettings(merged)
        }
      } catch { /* silent refresh — local state is still valid */ }
    } catch (error) {
      toast({ title: 'Error', description: getUserErrorMessage(error, 'Failed to save settings.'), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }, [editorMode, rawContent, iniSettings, setOriginalRawContent, setOriginalIniSettings, setIniSettings, reloadAll, toast, setSaving])

  return {
    activeIniCategory, setActiveIniCategory,
    hasIniChanges, updateIniValue, resetIniValue, discardIniChanges,
    filteredIniSettings, iniModifiedByCategory, uncategorizedIniKeys,
    changedIniCount, handleSaveIni,
  }
}
