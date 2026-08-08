import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { getUserErrorMessage } from '@/lib/errorMessage'
import { panelBridgeApi, serverFilesApi } from '@/lib/api'
import { formatModSettingLabel } from '@/lib/modSettingsLabels'
import { VANILLA_SANDBOX_GROUPS } from '@/lib/serverConfigTypes'

export interface ModSettingOption {
  name?: string; shortName?: string; tableName?: string; value?: unknown;
  type?: string; min?: number; max?: number; default?: unknown;
  enumValues?: string[]; selectedIndex?: number; translatedName?: string;
  tooltip?: string; tooltipText?: string; pageName?: string;
}

interface GetAllSandboxOptionsResponse {
  success?: boolean
  data?: {
    options: Record<string, ModSettingOption[]>
    groups: Array<{ name: string; count: number }>
    totalCount: number
    enumerated: boolean
  }
  error?: string
}

// Live mod sandbox options from PanelBridge — loading, search/filter, and
// per-option updates. Isolated because it talks to the bridge, not the file.
export function useModSettings(activeTab: string) {
  const { toast } = useToast()
  const [modSettings, setModSettings] = useState<Record<string, ModSettingOption[]> | null>(null)
  const [modSettingsGroups, setModSettingsGroups] = useState<Array<{ name: string; count: number }>>([])
  const [modSettingsLoading, setModSettingsLoading] = useState(false)
  const [modSettingsError, setModSettingsError] = useState<string | null>(null)
  const [modSettingsSearch, setModSettingsSearch] = useState('')
  const [modSettingsModifiedOnly, setModSettingsModifiedOnly] = useState(false)
  const [expandedModGroups, setExpandedModGroups] = useState<Set<string>>(new Set())
  const [modSettingsLastLoaded, setModSettingsLastLoaded] = useState<Date | null>(null)
  const modSettingsAbortRef = useRef<AbortController | null>(null)
  const modSettingsSearchRef = useRef<HTMLInputElement | null>(null)
  const [savingOptions, setSavingOptions] = useState<Set<string>>(new Set())

  const isOptModified = useCallback((opt: { default?: unknown; value?: unknown }) => {
    if (opt.default === undefined || opt.default === null) return false
    const d = opt.default, v = opt.value
    if (typeof d === 'number' && typeof v === 'number') return Math.abs(d - v) >= 0.0001
    return String(d) !== String(v)
  }, [])

  const modifiedModSettingsCount = useMemo(() => {
    if (!modSettings) return 0
    let c = 0
    for (const opts of Object.values(modSettings)) for (const o of opts) if (isOptModified(o)) c++
    return c
  }, [modSettings, isOptModified])

  const filteredModGroups = useMemo(() => {
    if (!modSettings || !modSettingsGroups.length) return []
    const q = modSettingsSearch.toLowerCase().trim()
    return modSettingsGroups
      .map(group => {
        let opts = modSettings[group.name] || []
        if (modSettingsModifiedOnly) opts = opts.filter(isOptModified)
        if (q) {
          const groupMatches = formatModSettingLabel(group.name).toLowerCase().includes(q)
          if (!groupMatches) {
            opts = opts.filter(o =>
              (o.name || '').toLowerCase().includes(q) ||
              (o.shortName || '').toLowerCase().includes(q) ||
              (o.translatedName || '').toLowerCase().includes(q) ||
              formatModSettingLabel(o.translatedName || o.shortName || o.name, group.name).toLowerCase().includes(q) ||
              (o.tooltip || '').toLowerCase().includes(q) ||
              (o.tooltipText || '').toLowerCase().includes(q)
            )
          }
        }
        return { ...group, filteredOpts: opts }
      })
      .filter(g => g.filteredOpts.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [modSettings, modSettingsGroups, modSettingsSearch, modSettingsModifiedOnly, isOptModified])

  const loadModSettings = useCallback(async () => {
    modSettingsAbortRef.current?.abort()
    const controller = new AbortController()
    modSettingsAbortRef.current = controller
    setModSettingsLoading(true)
    setModSettingsError(null)
    try {
      const response = await panelBridgeApi.sendCommand('getAllSandboxOptions', {}) as GetAllSandboxOptionsResponse
      if (response?.success && response.data) {
        const options = Object.fromEntries(
          Object.entries(response.data.options).filter(([groupName]) => !VANILLA_SANDBOX_GROUPS.has(groupName))
        )
        const groups = response.data.groups.filter(group => !VANILLA_SANDBOX_GROUPS.has(group.name))
        setModSettings(options)
        setModSettingsGroups(groups)
        setModSettingsLastLoaded(new Date())
        setModSettingsError(null)
      } else {
        setModSettingsError(response?.error || 'Failed to load mod settings. Is PanelBridge connected?')
      }
    } catch (error) {
      if (controller.signal.aborted) return
      setModSettingsError(getUserErrorMessage(error, 'Failed to load mod settings. Check PanelBridge connection.'))
    } finally {
      if (!controller.signal.aborted) setModSettingsLoading(false)
    }
  }, [])

  // Auto-load mod settings the first time the user opens the tab.
  // After an error, we don't auto-retry — the user can click "Retry".
  useEffect(() => {
    if (activeTab === 'modsettings' && !modSettings && !modSettingsLoading && !modSettingsError) {
      loadModSettings()
    }
  }, [activeTab, modSettings, modSettingsLoading, modSettingsError, loadModSettings])

  // Keyboard shortcut: '/' focuses the mod settings search when the tab is active.
  useEffect(() => {
    if (activeTab !== 'modsettings') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return
      if (modSettingsSearchRef.current) {
        e.preventDefault()
        modSettingsSearchRef.current.focus()
        modSettingsSearchRef.current.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTab])

  const handleOptionChange = useCallback(async (optName: string, newValue: unknown, groupName: string) => {
    setSavingOptions(prev => {
      if (prev.has(optName)) return prev
      const next = new Set(prev)
      next.add(optName)
      return next
    })
    try {
      const response = await panelBridgeApi.sendCommand('setSandboxOption', { name: optName, value: newValue }) as {
        success?: boolean
        data?: { name: string; value: unknown; type: string }
        error?: string
      }
      if (response?.success && response.data) {
        const confirmedVal = response.data.value ?? newValue
        setModSettings(prev => {
          if (!prev) return prev
          const updated = { ...prev }
          const groupOpts = updated[groupName]
          if (groupOpts) {
            updated[groupName] = groupOpts.map(o => {
              if (o.name !== optName) return o
              const patched = { ...o, value: confirmedVal }
              if (o.type === 'enum' && typeof confirmedVal === 'number') patched.selectedIndex = confirmedVal
              return patched
            })
          }
          return updated
        })
        toast({ title: 'Option Updated', description: `${optName} set successfully` })
        try {
          const saved = await serverFilesApi.saveSandboxOption(optName, confirmedVal as string | number | boolean)
          if (!saved.persisted) {
            toast({
              title: 'Applied, but not saved',
              description: `${optName} is not in SandboxVars.lua, so it will reset when the server restarts.`,
              variant: 'destructive',
            })
          }
        } catch (error) {
          toast({
            title: 'Applied, but not saved',
            description: getUserErrorMessage(error, `${optName} will reset when the server restarts.`),
            variant: 'destructive',
          })
        }
      } else {
        toast({ title: 'Failed to Update', description: response?.error || 'Unknown error', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Error', description: getUserErrorMessage(error, 'Failed to set option'), variant: 'destructive' })
    } finally {
      setSavingOptions(prev => {
        const next = new Set(prev)
        next.delete(optName)
        return next
      })
    }
  }, [toast])

  return {
    modSettings, modSettingsGroups, modSettingsLoading, modSettingsError,
    modSettingsSearch, setModSettingsSearch, modSettingsModifiedOnly, setModSettingsModifiedOnly,
    expandedModGroups, setExpandedModGroups, modSettingsLastLoaded, modSettingsSearchRef,
    savingOptions, isOptModified, modifiedModSettingsCount, filteredModGroups,
    loadModSettings, handleOptionChange,
  }
}
