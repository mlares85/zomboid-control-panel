import { useCallback, useState } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { useConfirm } from '@/contexts/ConfirmContext'
import { getUserErrorMessage } from '@/lib/errorMessage'
import { serverFilesApi, ConfigTemplate } from '@/lib/api'

// Templates dialog: list, save-as-template, apply, and delete.
export function useConfigTemplates(reloadAll: () => Promise<void>) {
  const { toast } = useToast()
  const confirm = useConfirm()

  const [showTemplates, setShowTemplates] = useState(false)
  const [templates, setTemplates] = useState<ConfigTemplate[]>([])
  const [templateLoading, setTemplateLoading] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateDesc, setNewTemplateDesc] = useState('')
  const [saveTemplateIni, setSaveTemplateIni] = useState(true)
  const [saveTemplateSandbox, setSaveTemplateSandbox] = useState(true)

  const loadTemplates = useCallback(async () => {
    setTemplateLoading(true)
    try {
      const data = await serverFilesApi.getTemplates()
      setTemplates(data.templates)
      setShowTemplates(true)
    } catch (error) {
      toast({ title: 'Error', description: getUserErrorMessage(error, 'Failed to load templates.'), variant: 'destructive' })
    } finally {
      setTemplateLoading(false)
    }
  }, [toast])

  const handleSaveTemplate = useCallback(async () => {
    if (!newTemplateName.trim()) {
      toast({ title: 'Error', description: 'Template name is required', variant: 'destructive' })
      return
    }
    setTemplateLoading(true)
    try {
      const result = await serverFilesApi.saveAsTemplate({
        name: newTemplateName.trim(),
        description: newTemplateDesc.trim(),
        includeIni: saveTemplateIni,
        includeSandbox: saveTemplateSandbox,
      })
      toast({ title: 'Saved', description: result.message })
      setShowSaveTemplate(false)
      setNewTemplateName('')
      setNewTemplateDesc('')
      if (showTemplates) {
        const data = await serverFilesApi.getTemplates()
        setTemplates(data.templates)
      }
    } catch (error) {
      toast({ title: 'Error', description: getUserErrorMessage(error, 'Failed to save template.'), variant: 'destructive' })
    } finally {
      setTemplateLoading(false)
    }
  }, [newTemplateName, newTemplateDesc, saveTemplateIni, saveTemplateSandbox, showTemplates, toast])

  const handleApplyTemplate = useCallback(async (id: string) => {
    setTemplateLoading(true)
    try {
      const result = await serverFilesApi.applyTemplate(id)
      toast({ title: 'Applied', description: result.message })
      setShowTemplates(false)
      reloadAll()
    } catch (error) {
      toast({ title: 'Error', description: getUserErrorMessage(error, 'Failed to apply template.'), variant: 'destructive' })
    } finally {
      setTemplateLoading(false)
    }
  }, [toast, reloadAll])

  const handleDeleteTemplate = useCallback(async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Delete template?',
      description: `Delete template "${name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await serverFilesApi.deleteTemplate(id)
      toast({ title: 'Deleted', description: `Template "${name}" deleted` })
      setTemplates(prev => prev.filter(t => t.id !== id))
    } catch (error) {
      toast({ title: 'Error', description: getUserErrorMessage(error, 'Failed to delete template.'), variant: 'destructive' })
    }
  }, [confirm, toast])

  return {
    showTemplates, setShowTemplates, templates, templateLoading,
    showSaveTemplate, setShowSaveTemplate,
    newTemplateName, setNewTemplateName, newTemplateDesc, setNewTemplateDesc,
    saveTemplateIni, setSaveTemplateIni, saveTemplateSandbox, setSaveTemplateSandbox,
    loadTemplates, handleSaveTemplate, handleApplyTemplate, handleDeleteTemplate,
  }
}
