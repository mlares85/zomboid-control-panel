import { BackupsDialog } from './BackupsDialog'
import { TemplatesDialog } from './TemplatesDialog'
import { SaveTemplateDialog } from './SaveTemplateDialog'
import { FileBrowserDialog } from './FileBrowserDialog'
import { useConfigBackups } from '@/hooks/serverConfig/useConfigBackups'
import { useConfigTemplates } from '@/hooks/serverConfig/useConfigTemplates'
import { useFileBrowser } from '@/hooks/serverConfig/useFileBrowser'

// Every modal on the page, bundled so the shell only needs one line per dialog group.
export function ServerConfigDialogs({
  backups,
  templates,
  fileBrowser,
}: {
  backups: ReturnType<typeof useConfigBackups>
  templates: ReturnType<typeof useConfigTemplates>
  fileBrowser: ReturnType<typeof useFileBrowser>
}) {
  return (
    <>
      <BackupsDialog
        open={backups.showBackups}
        onOpenChange={backups.setShowBackups}
        backups={backups.backups}
        backupFilter={backups.backupFilter}
        setBackupFilter={backups.setBackupFilter}
        onRestore={backups.handleRestoreBackup}
      />

      <TemplatesDialog
        open={templates.showTemplates}
        onOpenChange={templates.setShowTemplates}
        templates={templates.templates}
        templateLoading={templates.templateLoading}
        onOpenSaveTemplate={() => templates.setShowSaveTemplate(true)}
        onApply={templates.handleApplyTemplate}
        onDelete={templates.handleDeleteTemplate}
      />

      <SaveTemplateDialog
        open={templates.showSaveTemplate}
        onOpenChange={templates.setShowSaveTemplate}
        name={templates.newTemplateName}
        setName={templates.setNewTemplateName}
        description={templates.newTemplateDesc}
        setDescription={templates.setNewTemplateDesc}
        includeIni={templates.saveTemplateIni}
        setIncludeIni={templates.setSaveTemplateIni}
        includeSandbox={templates.saveTemplateSandbox}
        setIncludeSandbox={templates.setSaveTemplateSandbox}
        loading={templates.templateLoading}
        onSave={templates.handleSaveTemplate}
      />

      <FileBrowserDialog
        open={fileBrowser.fileBrowserOpen}
        onOpenChange={fileBrowser.setFileBrowserOpen}
        path={fileBrowser.fileBrowserPath}
        loading={fileBrowser.fileBrowserLoading}
        parent={fileBrowser.fileBrowserParent}
        dirs={fileBrowser.fileBrowserDirs}
        files={fileBrowser.fileBrowserFiles}
        selected={fileBrowser.fileBrowserSelected}
        onSelect={fileBrowser.setFileBrowserSelected}
        onSelectAndClose={fileBrowser.selectFileAndClose}
        onBrowseTo={fileBrowser.browseTo}
        onConfirm={fileBrowser.confirmFileBrowserSelection}
      />
    </>
  )
}
