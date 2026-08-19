import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { useSocket } from '@/contexts/SocketContext'
import { backupApi, serversApi, type BackupStatus, type BackupFile, type BackupFormatId } from '@/lib/api'

export interface BackupProgress {
  phase: 'preparing' | 'archiving' | 'finalizing' | 'complete' | 'error'
  percent: number
  message: string
  filesProcessed?: number
  totalFiles?: number
  currentFile?: string
}

export function useBackupsData() {
  const { toast } = useToast()
  const socket = useSocket()

  const progressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* ── state ────────────────────────────────────────────────────────── */
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null)
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null)
  const [deletingBackups, setDeletingBackups] = useState(false)
  const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(null)
  const [uploadingBackup, setUploadingBackup] = useState(false)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [backupFormat, setBackupFormat] = useState<BackupFormatId>('zip')
  const [activeServerRemote, setActiveServerRemote] = useState(false)
  const [selectedBackups, setSelectedBackups] = useState<Set<string>>(new Set())
  const [showSettings, setShowSettings] = useState(false)
  const [backupSchedule, setBackupSchedule] = useState('0 */6 * * *')
  const [backupMaxCount, setBackupMaxCount] = useState(10)
  const [savingSettings, setSavingSettings] = useState(false)

  /* ── fetchers ─────────────────────────────────────────────────────── */
  const fetchBackupStatus = useCallback(async () => {
    try {
      const status = await backupApi.getStatus()
      setBackupStatus(status)
      setBackupSchedule(status.schedule)
      setBackupMaxCount(status.maxBackups)
      setLoadError(null)
    } catch {
      setLoadError('Failed to load backup status.')
    }
  }, [])

  const fetchBackups = useCallback(async () => {
    try {
      const data = await backupApi.listBackups()
      setBackups(data.backups || [])
      setLoadError(null)
      setSelectedBackups(prev => {
        const backupNames = new Set((data.backups || []).map(b => b.name))
        const newSelection = new Set<string>()
        prev.forEach(name => { if (backupNames.has(name)) newSelection.add(name) })
        return newSelection
      })
    } catch {
      setLoadError('Failed to load backups.')
    }
  }, [])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchBackupStatus(),
        fetchBackups(),
        serversApi.getResolvedActive()
          .then(({ server }) => setActiveServerRemote(!!server?.isRemote))
          .catch(() => setActiveServerRemote(false)),
      ])
    } finally {
      setLoading(false)
    }
  }, [fetchBackupStatus, fetchBackups])

  /* ── effects ──────────────────────────────────────────────────────── */
  useEffect(() => { refreshAll() }, [refreshAll])

  useEffect(() => {
    if (!socket) return
    const handleProgress = (data: BackupProgress) => {
      setBackupProgress(data)
      if (progressTimeoutRef.current) {
        clearTimeout(progressTimeoutRef.current)
        progressTimeoutRef.current = null
      }
      if (data.phase === 'complete') {
        setCreatingBackup(false)
        fetchBackups()
        fetchBackupStatus()
        progressTimeoutRef.current = setTimeout(() => setBackupProgress(null), 2000)
      } else if (data.phase === 'error') {
        setCreatingBackup(false)
        progressTimeoutRef.current = setTimeout(() => setBackupProgress(null), 3000)
      }
    }
    socket.on('backup:progress', handleProgress)
    return () => {
      socket.off('backup:progress', handleProgress)
      if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current)
    }
  }, [socket, fetchBackups, fetchBackupStatus])

  /* ── actions ──────────────────────────────────────────────────────── */
  const handleCreateBackup = async () => {
    setCreatingBackup(true)
    setBackupProgress({ phase: 'preparing', percent: 0, message: 'Starting backup...' })
    try {
      const result = await backupApi.createBackup({ format: backupFormat })
      if (result.success && result.backup) {
        const backupLabel = 'name' in result.backup ? result.backup.name : (result.backup.fileName || result.backup.id)
        toast({
          title: 'Safehouse Snapshot Created',
          description: `Stored ${backupLabel} in ${result.duration?.toFixed(1)}s`,
          variant: 'success' as const,
        })
        if (result.destinationErrors && result.destinationErrors.length > 0) {
          toast({
            title: 'Some Backup Destinations Failed',
            description: result.destinationErrors
              .map((e) => `${e.destinationId}: ${e.message}`)
              .join('; '),
            variant: 'destructive',
          })
        }
        await fetchBackups()
        await fetchBackupStatus()
      } else {
        throw new Error(result.message || 'Failed to create backup')
      }
    } catch (error) {
      toast({
        title: 'Backup Failed',
        description: error instanceof Error ? error.message : 'Failed to create backup',
        variant: 'destructive',
      })
      setBackupProgress({ phase: 'error', percent: 0, message: 'Backup failed' })
    } finally {
      setCreatingBackup(false)
    }
  }

  const handleUploadFile = async (file: File) => {
    if (!file) return
    if (activeServerRemote) {
      toast({ title: 'Not available for remote servers', description: 'Backup uploads write to the local filesystem and aren\'t supported for remote servers.', variant: 'destructive' })
      return
    }
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast({ title: 'Invalid file', description: 'Only .zip backup archives are accepted.', variant: 'destructive' })
      return
    }
    const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({ title: 'File too large', description: `Backup archives must be 4 GB or smaller. This file is ${(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB.`, variant: 'destructive' })
      return
    }
    if (file.size === 0) {
      toast({ title: 'Empty file', description: 'The selected .zip is empty.', variant: 'destructive' })
      return
    }
    setUploadingBackup(true)
    setUploadPercent(0)
    try {
      const result = await backupApi.uploadBackup(file, setUploadPercent)
      toast({ title: 'Backup Uploaded', description: `Stored as ${result.name}. Use Restore to apply it.`, variant: 'success' as const })
      await fetchBackups()
      await fetchBackupStatus()
    } catch (error) {
      toast({ title: 'Upload Failed', description: error instanceof Error ? error.message : 'Failed to upload backup', variant: 'destructive' })
    } finally {
      setUploadingBackup(false)
      setUploadPercent(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRestoreBackup = async (name: string) => {
    setRestoringBackup(name)
    try {
      const result = await backupApi.restoreBackup(name, { createPreRestoreBackup: true })
      if (result.success) {
        toast({ title: 'Recovery Point Restored', description: `Rolled back to ${name} in ${(result.duration || 0).toFixed(1)}s`, variant: 'success' as const })
        await fetchBackups()
      } else {
        throw new Error(result.message || 'Failed to restore backup')
      }
    } catch (error) {
      toast({ title: 'Restore Failed', description: error instanceof Error ? error.message : 'Failed to restore backup', variant: 'destructive' })
    } finally {
      setRestoringBackup(null)
    }
  }

  const handleDeleteBackups = async (names: string[]) => {
    setDeletingBackups(true)
    try {
      let successCount = 0
      let failCount = 0
      for (const name of names) {
        try {
          const result = await backupApi.deleteBackup(name)
          if (result.success) successCount++; else failCount++
        } catch { failCount++ }
      }
      if (successCount > 0) {
        toast({ title: 'Old Snapshots Cleared', description: `Removed ${successCount} backup${successCount !== 1 ? 's' : ''}${failCount > 0 ? ` (${failCount} failed)` : ''}`, variant: 'success' as const })
      }
      if (failCount > 0 && successCount === 0) {
        toast({ title: 'Delete Failed', description: `Failed to delete ${failCount} backup${failCount !== 1 ? 's' : ''}`, variant: 'destructive' })
      }
      setSelectedBackups(new Set())
      await fetchBackups()
    } catch (error) {
      toast({ title: 'Delete Failed', description: error instanceof Error ? error.message : 'Failed to delete backups', variant: 'destructive' })
    } finally {
      setDeletingBackups(false)
    }
  }

  const handleDeleteOlderThan = async (days: number) => {
    try {
      const result = await backupApi.deleteOlderThan(days)
      if (result.success) {
        toast({ title: 'Old Backups Removed', description: result.message || `Removed ${result.deleted || 0} aging backups`, variant: 'success' as const })
        await fetchBackups()
      } else {
        toast({ title: 'Delete Failed', description: result.message || 'Failed to delete old backups', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Delete Failed', description: error instanceof Error ? error.message : 'Failed to delete old backups', variant: 'destructive' })
    }
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      await backupApi.updateSettings({
        enabled: backupStatus?.enabled || false,
        schedule: backupSchedule,
        maxBackups: backupMaxCount,
      })
      await fetchBackupStatus()
      toast({ title: 'Backup Plan Updated', description: 'The panel saved your current backup schedule and limits.', variant: 'success' as const })
    } catch (error) {
      toast({ title: 'Backup Plan Update Failed', description: error instanceof Error ? error.message : 'Failed to save settings', variant: 'destructive' })
    } finally {
      setSavingSettings(false)
    }
  }

  const toggleBackupEnabled = async (enabled: boolean) => {
    try {
      await backupApi.updateSettings({ enabled })
      await fetchBackupStatus()
      toast({
        title: enabled ? 'Automatic Snapshots Armed' : 'Automatic Snapshots Stood Down',
        description: enabled ? 'Recurring backup jobs are now active.' : 'Recurring backup jobs are currently paused.',
        variant: 'success' as const,
      })
    } catch (error) {
      toast({ title: 'Automatic Backup Update Failed', description: error instanceof Error ? error.message : 'Failed to update backup settings', variant: 'destructive' })
    }
  }

  const toggleBackupSelection = (name: string) => {
    setSelectedBackups(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedBackups.size === backups.length) setSelectedBackups(new Set())
    else setSelectedBackups(new Set(backups.map(b => b.name)))
  }

  /* ── derived ─────────────────────────────────────────────────────── */
  const totalSize = useMemo(() => backups.reduce((sum, b) => sum + b.size, 0), [backups])
  const isAnySelected = selectedBackups.size > 0
  const allSelected = backups.length > 0 && selectedBackups.size === backups.length

  return {
    // state
    backupStatus, backups, loading, loadError, creatingBackup, restoringBackup,
    deletingBackups, backupProgress, uploadingBackup, uploadPercent, backupFormat,
    activeServerRemote, selectedBackups, showSettings, backupSchedule, backupMaxCount,
    savingSettings, fileInputRef,
    // derived
    totalSize, isAnySelected, allSelected,
    // setters (for controlled inputs in the shell)
    setBackupFormat, setShowSettings, setBackupSchedule, setBackupMaxCount,
    // actions
    refreshAll, handleCreateBackup, handleUploadFile, handleRestoreBackup,
    handleDeleteBackups, handleDeleteOlderThan, handleSaveSettings, toggleBackupEnabled,
    // selection
    toggleBackupSelection, toggleSelectAll,
  }
}
