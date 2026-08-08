import { useCallback, useEffect, useRef, useState } from 'react'
import { copyText } from '@/lib/utils'
import { reportClientError } from '@/lib/client-errors'
import { serverFilesApi, SpawnPointsByProfession, SpawnRegion, SandboxData } from '@/lib/api'
import { getUserErrorMessage } from '@/lib/errorMessage'
import { useToast } from '@/components/ui/use-toast'
import { mergeSchemaDefaults, createSandboxDefaults } from '@/lib/serverConfigTypes'

export interface ServerConfigPaths {
  configPath: string
  serverName: string
  exists: { ini: boolean; sandbox: boolean; spawnpoints: boolean; spawnregions: boolean }
}

export type RawFileType = 'ini' | 'sandbox' | 'spawnpoints' | 'spawnregions'

// Loads every config file the page needs (paths, INI, sandbox, spawn data)
// and owns the raw-editor content + backup/copy helpers shared across tabs.
export function useServerConfigLoader() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pathsInfo, setPathsInfo] = useState<ServerConfigPaths | null>(null)

  const [iniSettings, setIniSettings] = useState<Record<string, string>>({})
  const [originalIniSettings, setOriginalIniSettings] = useState<Record<string, string>>({})
  const [sandboxData, setSandboxData] = useState<SandboxData | null>(null)
  const [originalSandboxData, setOriginalSandboxData] = useState<SandboxData | null>(null)
  const [spawnPoints, setSpawnPoints] = useState<SpawnPointsByProfession>({})
  const [spawnRegions, setSpawnRegions] = useState<SpawnRegion[]>([])

  const [rawContent, setRawContent] = useState('')
  const [originalRawContent, setOriginalRawContent] = useState('')
  const [_loadingRaw, setLoadingRaw] = useState(false)

  const [copied, setCopied] = useState(false)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const paths = await serverFilesApi.getPaths()
      setPathsInfo(paths)
      if (paths.exists.ini) {
        const iniData = await serverFilesApi.getIni()
        const merged = mergeSchemaDefaults(iniData.settings)
        setIniSettings(merged)
        setOriginalIniSettings(merged)
      }
      const sandboxRes = paths.exists.sandbox
        ? await serverFilesApi.getSandbox()
        : { sandbox: createSandboxDefaults() }
      setSandboxData(sandboxRes.sandbox)
      setOriginalSandboxData(sandboxRes.sandbox)
      if (paths.exists.spawnpoints) {
        const spawnRes = await serverFilesApi.getSpawnPoints()
        setSpawnPoints(spawnRes.spawnpoints)
      }
      if (paths.exists.spawnregions) {
        const regionsRes = await serverFilesApi.getSpawnRegions()
        setSpawnRegions(regionsRes.spawnregions)
      }
      setLoadError(null)
    } catch (error) {
      reportClientError('Failed to load config.', error)
      setLoadError(getUserErrorMessage(error, 'Failed to load server config.'))
      toast({ title: 'Error', description: getUserErrorMessage(error, 'Failed to load server config.'), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intentional mount-only init

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
    }
  }, [])

  const loadRawContent = useCallback(async (type: RawFileType, onFallback?: () => void) => {
    setLoadingRaw(true)
    try {
      const data = await serverFilesApi.getRaw(type)
      setRawContent(data.content)
      setOriginalRawContent(data.content)
    } catch (error) {
      toast({ title: 'Error', description: getUserErrorMessage(error, 'Failed to load raw content.'), variant: 'destructive' })
      onFallback?.()
    } finally {
      setLoadingRaw(false)
    }
  }, [toast])

  const handleCreateBackup = useCallback(async (type: RawFileType) => {
    try {
      const data = await serverFilesApi.getRaw(type)
      const blob = new Blob([data.content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${data.filename}_${new Date().toISOString().replace(/[:.]/g, '-')}.bak`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: 'Downloaded', description: `Backup saved: ${data.filename}` })
    } catch (error) {
      toast({ title: 'Error', description: getUserErrorMessage(error, 'Failed to download backup.'), variant: 'destructive' })
    }
  }, [toast])

  const handleCopyRaw = useCallback(async () => {
    try {
      await copyText(rawContent)
      setCopied(true)
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
      toast({ title: 'Copied', description: 'Content copied to clipboard' })
    } catch (error) {
      toast({ title: 'Error', description: getUserErrorMessage(error, 'Failed to copy content to clipboard.'), variant: 'destructive' })
    }
  }, [rawContent, toast])

  return {
    loading, loadError, pathsInfo, loadData,
    iniSettings, setIniSettings, originalIniSettings, setOriginalIniSettings,
    sandboxData, setSandboxData, originalSandboxData, setOriginalSandboxData,
    spawnPoints, setSpawnPoints, spawnRegions, setSpawnRegions,
    rawContent, setRawContent, originalRawContent, setOriginalRawContent,
    loadRawContent, handleCreateBackup, handleCopyRaw, copied,
  }
}
