import { useCallback, useState } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { getUserErrorMessage } from '@/lib/errorMessage'
import { serverFilesApi } from '@/lib/api'

export type BackupFilter = 'all' | 'ini' | 'sandbox' | 'spawnpoints' | 'spawnregions'

// Backups dialog: list, filter, and restore config file backups.
export function useConfigBackups(reloadAll: () => Promise<void>) {
  const { toast } = useToast()
  const [showBackups, setShowBackups] = useState(false)
  const [backups, setBackups] = useState<{ filename: string; size: number; created: string }[]>([])
  const [backupFilter, setBackupFilter] = useState<BackupFilter>('all')

  const loadBackups = useCallback(async () => {
    try {
      const data = await serverFilesApi.getBackups()
      setBackups(data.backups)
      setShowBackups(true)
    } catch (error) {
      toast({ title: 'Error', description: getUserErrorMessage(error, 'Failed to load backups.'), variant: 'destructive' })
    }
  }, [toast])

  const handleRestoreBackup = useCallback(async (filename: string) => {
    try {
      await serverFilesApi.restoreBackup(filename)
      toast({ title: 'Restored', description: `Restored from ${filename}` })
      setShowBackups(false)
      reloadAll()
    } catch (error) {
      toast({ title: 'Error', description: getUserErrorMessage(error, 'Failed to restore backup.'), variant: 'destructive' })
    }
  }, [toast, reloadAll])

  return { showBackups, setShowBackups, backups, backupFilter, setBackupFilter, loadBackups, handleRestoreBackup }
}
