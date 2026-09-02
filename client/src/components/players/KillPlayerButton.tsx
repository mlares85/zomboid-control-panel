import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Skull } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { panelBridgeApi } from '@/lib/api'

interface KillPlayerButtonProps {
  username: string
  /** Refreshes the roster/health readouts after a successful kill. */
  onKilled?: () => void
}

/**
 * Instantly kills the player's in-game character. Irreversible, so — like
 * the other permanent moderation actions on this page — it requires typing
 * the exact username before the confirm button unlocks.
 */
export function KillPlayerButton({ username, onKilled }: KillPlayerButtonProps) {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const killMutation = useMutation({
    mutationFn: () => panelBridgeApi.killPlayer(username),
    onSuccess: () => {
      toast({ title: 'Player killed', description: `${username}'s character has been killed`, variant: 'success' as const })
      setOpen(false)
      setConfirmText('')
      queryClient.invalidateQueries({ queryKey: ['player-vitals', username] })
      onKilled?.()
    },
    onError: (error) => {
      toast({
        title: 'Kill failed',
        description: error instanceof Error ? error.message : 'Could not kill the player',
        variant: 'destructive',
      })
    },
  })

  const isConfirmed = confirmText === username

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setConfirmText('') }}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={!username}
          className="h-8 gap-1.5 border-destructive/45 text-xs font-medium text-destructive hover:border-destructive/65 hover:bg-destructive/10"
          title="Kill player"
        >
          <Skull className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Kill</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Skull className="h-5 w-5" />
            Kill Player
          </DialogTitle>
          <DialogDescription>
            This instantly kills <strong>{username}</strong>&apos;s character. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="kill-confirm-username">
            Type <span className="font-mono text-foreground">{username}</span> to confirm
          </Label>
          <Input
            id="kill-confirm-username"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={username}
            autoComplete="off"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!isConfirmed || killMutation.isPending}
            onClick={() => killMutation.mutate()}
          >
            {killMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Kill Player
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
