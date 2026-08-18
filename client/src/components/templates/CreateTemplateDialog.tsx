import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useToast } from '@/components/ui/use-toast'
import { serverFilesApi, templatesApi } from '@/lib/api'
import { buildTemplateCapture, TemplateCapture } from '@/lib/templateBuilder'
import { FieldHelp } from '@/components/FieldHelp'
import type { FieldHelpData } from '@/lib/wiki/types'

const FIELD_HELP: Record<string, FieldHelpData> = {
  name: {
    description: 'The name shown for this template in your template library.',
    context: 'Also used to build the suggested filename when exporting — pick something that distinguishes it from your other saved templates.',
    recommendation: 'must-configure',
    articleId: 'creating-templates',
  },
  description: {
    description: 'A short summary of what this template changes or is meant for.',
    context: 'Shown on the template card and in the preview dialog — helps you tell templates apart later without opening the diff.',
    recommendation: 'safe-default',
    articleId: 'creating-templates',
  },
  tags: {
    description: 'Comma-separated labels for filtering and organizing templates.',
    context: 'Purely organizational — has no effect on what settings the template applies.',
    recommendation: 'safe-default',
    articleId: 'creating-templates',
  },
}

interface CreateTemplateDialogProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function CreateTemplateDialog({ open, onClose, onCreated }: CreateTemplateDialogProps) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [capture, setCapture] = useState<TemplateCapture | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setDescription('')
    setTags('')
    setError(null)
    setLoading(true)
    Promise.all([serverFilesApi.getIni(), serverFilesApi.getSandbox()])
      .then(([ini, sandbox]) => setCapture(buildTemplateCapture(ini.settings, sandbox.sandbox)))
      .catch(() => setError('Failed to read the current server configuration.'))
      .finally(() => setLoading(false))
  }, [open])

  const handleSave = async () => {
    if (!capture || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const result = await templatesApi.create({
        name: name.trim(),
        description: description.trim(),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        serverIni: capture.serverIni,
        sandboxVars: capture.sandboxVars,
      })
      if (!result.success) throw new Error(result.error || 'Failed to save template')
      toast({ title: 'Template Saved', description: `"${name.trim()}" is ready to reuse.`, variant: 'success' as const })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save Current Config as Template</DialogTitle>
          <DialogDescription>Captures this server's current server.ini and sandbox settings.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="template-name" className="flex items-center gap-1.5">
                Name
                <FieldHelp {...FIELD_HELP.name} />
              </Label>
              <Input id="template-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Ruleset" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template-description" className="flex items-center gap-1.5">
                Description
                <FieldHelp {...FIELD_HELP.description} />
              </Label>
              <Textarea id="template-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template-tags" className="flex items-center gap-1.5">
                Tags (comma separated)
                <FieldHelp {...FIELD_HELP.tags} />
              </Label>
              <Input id="template-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="hardcore, pvp" />
            </div>
            {capture && (
              <p className="text-xs text-muted-foreground">
                Will save {capture.sandboxKeyCount} sandbox setting(s) and {capture.iniKeyCount} server.ini key(s).
                Identity and connection settings (name, ports, passwords) are never included.
              </p>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Couldn't save template</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading || !name.trim() || !capture}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
