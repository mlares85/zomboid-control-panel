import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Check, FileText, FolderOpen, Loader2 } from 'lucide-react'
import { AuthImage } from './AuthImage'

function joinPath(base: string, name: string): string {
  const sep = base.endsWith('/') || base.endsWith('\\') ? '' : (base.includes('/') ? '/' : '\\')
  return base + sep + name
}

export function FileBrowserDialog({
  open,
  onOpenChange,
  path,
  loading,
  parent,
  dirs,
  files,
  selected,
  onSelect,
  onSelectAndClose,
  onBrowseTo,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  path: string
  loading: boolean
  parent: string | null
  dirs: string[]
  files: { name: string; ext: string }[]
  selected: string | null
  onSelect: (fullPath: string) => void
  onSelectAndClose: (fullPath: string) => void
  onBrowseTo: (dirPath: string) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Select Image File
          </DialogTitle>
          <DialogDescription>Browse to find a PNG image file for your server.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1.5 text-xs font-mono bg-muted/50 rounded-md px-3 py-2 overflow-x-auto">
          <span className="text-muted-foreground truncate" title={path}>{path || 'Loading...'}</span>
        </div>

        <ScrollArea className="flex-1 min-h-[300px] max-h-[400px] border rounded-md">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {parent && (
                <button
                  onClick={() => onBrowseTo(parent)}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-md hover:bg-muted/70 text-sm transition-colors"
                >
                  <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-muted-foreground">..</span>
                </button>
              )}

              {dirs.map(dir => (
                <button
                  key={`d-${dir}`}
                  onClick={() => onBrowseTo(joinPath(path, dir))}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-md hover:bg-muted/70 text-sm transition-colors"
                >
                  <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="truncate">{dir}</span>
                </button>
              ))}

              {files.map(file => {
                const fullPath = joinPath(path, file.name)
                const isSelected = selected === fullPath
                return (
                  <button
                    key={`f-${file.name}`}
                    onClick={() => onSelect(fullPath)}
                    onDoubleClick={() => onSelectAndClose(fullPath)}
                    className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm transition-colors ${
                      isSelected ? 'bg-primary/15 border border-primary/30 ring-1 ring-primary/20' : 'hover:bg-muted/70'
                    }`}
                  >
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="truncate flex-1 text-left">{file.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{file.ext}</span>
                  </button>
                )
              })}

              {dirs.length === 0 && files.length === 0 && !parent && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No image files found in this directory
                </div>
              )}
              {dirs.length === 0 && files.length === 0 && parent && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  No image files here &mdash; try a different folder
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {selected && (
          <div className="flex items-start gap-3 bg-muted/30 rounded-md p-3 border">
            <div className="rounded-md border bg-background p-1 shrink-0">
              <AuthImage filePath={selected} alt="Preview" className="max-h-[64px] max-w-[120px] object-contain rounded" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{selected.split(/[/\\]/).pop()}</p>
              <p className="text-xs text-muted-foreground font-mono truncate mt-0.5" title={selected}>{selected}</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onConfirm} disabled={!selected}>
            <Check className="w-4 h-4 mr-2" />
            Select File
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
