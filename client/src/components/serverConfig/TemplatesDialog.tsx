import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Bookmark, CheckCircle, FolderOpen, Loader2, Plus, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { ConfigTemplate } from '@/lib/api'

export function TemplatesDialog({
  open,
  onOpenChange,
  templates,
  templateLoading,
  onOpenSaveTemplate,
  onApply,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: ConfigTemplate[]
  templateLoading: boolean
  onOpenSaveTemplate: () => void
  onApply: (id: string) => void
  onDelete: (id: string, name: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="w-5 h-5" />
            Config Templates
          </DialogTitle>
          <DialogDescription>
            Save your current configuration as a template or load a saved template.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between border-b pb-3">
          <span className="text-sm text-muted-foreground">
            {templates.length} template{templates.length !== 1 ? 's' : ''} saved
          </span>
          <Button onClick={onOpenSaveTemplate}>
            <Plus className="w-4 h-4 mr-2" />
            Save Current as Template
          </Button>
        </div>

        <ScrollArea className="h-[400px]">
          {templates.length === 0 ? (
            <EmptyState type="noData" title="No templates saved yet" description="Click 'Save Current as Template' to create your first template" compact />
          ) : (
            <div className="space-y-3">
              {templates.map((template) => (
                <div key={template.id} className="rounded-lg border p-4 transition-colors hover:bg-muted/50">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-medium break-words" dir="auto" title={template.name}>{template.name}</h4>
                        <Badge variant="secondary" className="text-xs">
                          {template.type === 'both' ? 'INI + Sandbox' : template.type.toUpperCase()}
                        </Badge>
                      </div>
                      {template.description && (
                        <p className="mt-1 break-words text-sm text-muted-foreground" dir="auto" title={template.description}>{template.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>Created: {new Date(template.created).toLocaleDateString()}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          {template.hasIni && <CheckCircle className="w-3 h-3 text-primary" />}
                          {template.hasIni && 'INI'}
                        </span>
                        {template.hasIni && template.hasSandbox && <span>•</span>}
                        <span className="flex items-center gap-1">
                          {template.hasSandbox && <CheckCircle className="w-3 h-3 text-primary" />}
                          {template.hasSandbox && 'Sandbox'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:ml-4 sm:self-start">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="default" size="sm" disabled={templateLoading} onClick={() => onApply(template.id)}>
                              {templateLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <FolderOpen className="w-4 h-4 mr-1" />
                                  Apply
                                </>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Load this template (creates backup first)</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 text-destructive hover:text-destructive sm:h-9 sm:w-9"
                              onClick={() => onDelete(template.id, template.name)}
                              aria-label={`Delete template ${template.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete this template</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
