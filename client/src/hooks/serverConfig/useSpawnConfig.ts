import { useCallback } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { getUserErrorMessage } from '@/lib/errorMessage'
import { serverFilesApi, SpawnPointsByProfession, SpawnRegion } from '@/lib/api'
import { EditorMode } from '@/lib/serverConfigTypes'

// Save handlers for the Spawn Points and Spawn Regions tabs (both mostly
// mod-managed, so structured editing is limited compared to INI/Sandbox).
export function useSpawnConfig(params: {
  spawnPoints: SpawnPointsByProfession
  spawnRegions: SpawnRegion[]
  editorMode: EditorMode
  rawContent: string
  reloadAll: () => Promise<void>
  setSaving: (v: boolean) => void
}) {
  const { spawnPoints, spawnRegions, editorMode, rawContent, reloadAll, setSaving } = params
  const { toast } = useToast()

  const handleSaveSpawnPoints = useCallback(async () => {
    setSaving(true)
    try {
      if (editorMode === 'raw') {
        await serverFilesApi.saveRaw('spawnpoints', rawContent)
      } else {
        await serverFilesApi.saveSpawnPoints(spawnPoints)
      }
      toast({ title: 'Saved', description: 'Spawn points saved' })
      if (editorMode === 'raw') reloadAll()
    } catch (error) {
      toast({ title: 'Error', description: getUserErrorMessage(error, 'Failed to save spawn points.'), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }, [editorMode, rawContent, spawnPoints, reloadAll, toast, setSaving])

  const handleSaveSpawnRegions = useCallback(async () => {
    setSaving(true)
    try {
      if (editorMode === 'raw') {
        await serverFilesApi.saveRaw('spawnregions', rawContent)
      } else {
        await serverFilesApi.saveSpawnRegions(spawnRegions)
      }
      toast({ title: 'Saved', description: 'Spawn regions saved' })
      if (editorMode === 'raw') reloadAll()
    } catch (error) {
      toast({ title: 'Error', description: getUserErrorMessage(error, 'Failed to save spawn regions.'), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }, [editorMode, rawContent, spawnRegions, reloadAll, toast, setSaving])

  return { handleSaveSpawnPoints, handleSaveSpawnRegions }
}
