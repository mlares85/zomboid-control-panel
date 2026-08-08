import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Bookmark, History, RefreshCw } from 'lucide-react'

export function ServerConfigHeaderActions({
  hasUnsavedChanges,
  onOpenTemplates,
  onOpenBackups,
  onRefresh,
}: {
  hasUnsavedChanges: boolean
  onOpenTemplates: () => void
  onOpenBackups: () => void
  onRefresh: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hasUnsavedChanges && (
        <Badge variant="warning" className="motion-safe:animate-pulse text-xs font-medium">
          <AlertTriangle className="mr-1 h-3 w-3" />
          Unsaved changes
        </Badge>
      )}
      <Button variant="command" size="sm" className="h-9 gap-1.5 text-xs font-medium" onClick={onOpenTemplates}>
        <Bookmark className="h-3.5 w-3.5" /> Templates
      </Button>
      <Button variant="command" size="sm" className="h-9 gap-1.5 text-xs font-medium" onClick={onOpenBackups}>
        <History className="h-3.5 w-3.5" /> Backups
      </Button>
      <Button variant="command" size="sm" className="h-9 gap-1.5 text-xs font-medium" onClick={onRefresh}>
        <RefreshCw className="h-3.5 w-3.5" /> Refresh
      </Button>
    </div>
  )
}
