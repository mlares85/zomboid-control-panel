import { AlertTriangle } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import type { ConfirmAction } from './types'

interface Props {
  action: ConfirmAction | null
  onClose: () => void
  onConfirm: (action: ConfirmAction) => void
}

export function ConfirmDialog({ action, onClose, onConfirm }: Props) {
  return (
    <AlertDialog open={!!action} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="glass border-border/50">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-3 text-xl">
            <AlertTriangle className={cn('h-5 w-5', action?.variant === 'destructive' ? 'text-destructive' : 'text-warning')} />
            {action?.title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">{action?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel className="mt-0">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: action?.variant === 'destructive' ? 'destructive' : 'warning' }))}
            onClick={() => action && onConfirm(action)}
          >
            {action?.title}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
