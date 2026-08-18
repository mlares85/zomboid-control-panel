import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { backupApi } from '@/lib/api'
import { useBackupsData } from '@/hooks/backups/useBackupsData'
import { BackupPageHeader } from '@/components/backups/BackupPageHeader'
import { BackupStatusCards } from '@/components/backups/BackupStatusCards'
import { BackupSettingsPanel } from '@/components/backups/BackupSettingsPanel'
import { BackupProgressCard } from '@/components/backups/BackupProgressCard'
import { BackupFileList } from '@/components/backups/BackupFileList'
import { BackupDialogs } from '@/components/backups/BackupDialogs'
import { BackupAdvancedPanel } from '@/components/backup/BackupAdvancedPanel'
import { BackupHistoryTable } from '@/components/backup/BackupHistoryTable'

export default function Backups() {
  const d = useBackupsData()

  // Dialog state lives in the shell — lightweight UI toggles, not data logic
  const [restoreDialog, setRestoreDialog] = useState<{ open: boolean; backupName: string | null }>({ open: false, backupName: null })
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; names: string[] }>({ open: false, names: [] })
  const [deleteOlderDialog, setDeleteOlderDialog] = useState(false)
  const [deleteOlderDays, setDeleteOlderDays] = useState(7)
  const [deletingOlder, setDeletingOlder] = useState(false)

  const handleDeleteOlder = async () => {
    setDeleteOlderDialog(false)
    setDeletingOlder(true)
    try {
      await d.handleDeleteOlderThan(deleteOlderDays)
    } finally {
      setDeletingOlder(false)
    }
  }

  return (
    <div className="space-y-6 page-transition">
      <BackupPageHeader
        backupFormat={d.backupFormat}
        onFormatChange={d.setBackupFormat}
        creatingBackup={d.creatingBackup}
        restoringBackup={d.restoringBackup}
        uploadingBackup={d.uploadingBackup}
        uploadPercent={d.uploadPercent}
        savesExists={d.backupStatus?.savesExists ?? false}
        activeServerRemote={d.activeServerRemote}
        loading={d.loading}
        onCreateBackup={d.handleCreateBackup}
        onUploadClick={() => d.fileInputRef.current?.click()}
        onToggleSettings={() => d.setShowSettings(s => !s)}
        onRefresh={d.refreshAll}
      />

      {/* Hidden file input for upload */}
      <input
        ref={d.fileInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) d.handleUploadFile(file)
        }}
      />

      {d.loadError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Backup data unavailable</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{d.loadError}</span>
            <Button variant="outline" size="sm" onClick={d.refreshAll} className="self-start sm:self-auto">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {d.activeServerRemote && (
        <Alert className="border-warning/40 bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertTitle>Backups disabled for remote servers</AlertTitle>
          <AlertDescription>
            The active server is configured as remote, so the panel can&apos;t reach its filesystem.
            Create, upload, and restore are unavailable until you switch to a local server.
          </AlertDescription>
        </Alert>
      )}

      <BackupStatusCards
        backups={d.backups}
        backupStatus={d.backupStatus}
        totalSize={d.totalSize}
        onToggleEnabled={d.toggleBackupEnabled}
      />

      {d.showSettings && (
        <BackupSettingsPanel
          backupSchedule={d.backupSchedule}
          onScheduleChange={d.setBackupSchedule}
          backupMaxCount={d.backupMaxCount}
          onMaxCountChange={d.setBackupMaxCount}
          savesPath={d.backupStatus?.savesPath ?? undefined}
          savingSettings={d.savingSettings}
          onSave={d.handleSaveSettings}
        />
      )}

      <BackupProgressCard
        backupProgress={d.backupProgress}
        creatingBackup={d.creatingBackup}
      />

      <BackupHistoryTable />
      <BackupAdvancedPanel />

      <BackupFileList
        backups={d.backups}
        selectedBackups={d.selectedBackups}
        allSelected={d.allSelected}
        isAnySelected={d.isAnySelected}
        restoringBackup={d.restoringBackup}
        creatingBackup={d.creatingBackup}
        deletingBackups={d.deletingBackups}
        deletingOlder={deletingOlder}
        savesExists={d.backupStatus?.savesExists ?? false}
        loading={d.loading}
        onToggleSelection={d.toggleBackupSelection}
        onToggleSelectAll={d.toggleSelectAll}
        onRestore={(name) => setRestoreDialog({ open: true, backupName: name })}
        onDownload={(name) => backupApi.downloadBackup(name)}
        onDeleteSelected={(names) => setDeleteDialog({ open: true, names })}
        onDeleteOlderOpen={() => setDeleteOlderDialog(true)}
        onCreateBackup={d.handleCreateBackup}
      />

      <BackupDialogs
        restoreDialog={restoreDialog}
        onRestoreDialogChange={(open) => setRestoreDialog({ open, backupName: null })}
        onRestoreConfirm={(name) => {
          setRestoreDialog({ open: false, backupName: null })
          d.handleRestoreBackup(name)
        }}
        deleteDialog={deleteDialog}
        onDeleteDialogChange={(open) => setDeleteDialog({ open, names: [] })}
        onDeleteConfirm={(names) => {
          setDeleteDialog({ open: false, names: [] })
          d.handleDeleteBackups(names)
        }}
        deleteOlderDialog={deleteOlderDialog}
        onDeleteOlderDialogChange={setDeleteOlderDialog}
        deleteOlderDays={deleteOlderDays}
        onDeleteOlderDaysChange={setDeleteOlderDays}
        onDeleteOlderConfirm={handleDeleteOlder}
      />
    </div>
  )
}
