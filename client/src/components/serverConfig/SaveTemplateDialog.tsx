import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Loader2, Save } from 'lucide-react'

export function SaveTemplateDialog({
  open,
  onOpenChange,
  name,
  setName,
  description,
  setDescription,
  includeIni,
  setIncludeIni,
  includeSandbox,
  setIncludeSandbox,
  loading,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  setName: (v: string) => void
  description: string
  setDescription: (v: string) => void
  includeIni: boolean
  setIncludeIni: (v: boolean) => void
  includeSandbox: boolean
  setIncludeSandbox: (v: boolean) => void
  loading: boolean
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="w-5 h-5" />
            Save as Template
          </DialogTitle>
          <DialogDescription>
            Save your current INI and/or Sandbox settings as a reusable template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name *</Label>
            <Input
              id="template-name"
              placeholder="e.g., PvE Casual, Hardcore Survival..."
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              maxLength={60}
            />
            <p className="text-xs text-muted-foreground">{name.length}/60 characters</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-desc">Description (optional)</Label>
            <Textarea
              id="template-desc"
              placeholder="Describe what this template is for..."
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 240))}
              className="min-h-[80px] resize-y"
              maxLength={240}
            />
            <p className="text-xs text-muted-foreground">{description.length}/240 characters</p>
          </div>

          <div className="space-y-3">
            <Label>Include in Template</Label>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">Server Settings (INI)</p>
                <p className="text-xs text-muted-foreground">Network, players, RCON, server behavior</p>
              </div>
              <Switch checked={includeIni} onCheckedChange={setIncludeIni} aria-label="Include server settings in template" />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">Sandbox Settings</p>
                <p className="text-xs text-muted-foreground">World, zombies, loot, survival settings</p>
              </div>
              <Switch checked={includeSandbox} onCheckedChange={setIncludeSandbox} aria-label="Include sandbox settings in template" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={loading || !name.trim() || (!includeIni && !includeSandbox)}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
