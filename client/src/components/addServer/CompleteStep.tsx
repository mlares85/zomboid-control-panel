import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, CheckCircle2, Copy, LayoutDashboard, Puzzle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { serversApi, type ServerInstance } from '@/lib/api'
import { copyText } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'

interface CompleteStepProps {
  serverId: string | number
  onGoToDashboard: () => void
}

const NEXT_ACTIONS = [
  { to: '/server-config', icon: Sparkles, label: 'Apply a template', description: 'Tune gameplay settings in one pass.' },
  { to: '/mods', icon: Puzzle, label: 'Install mods', description: 'Browse Workshop mods for this server.' },
  { to: '/backups', icon: Archive, label: 'Set up backups', description: 'Schedule automatic world backups.' },
]

export function CompleteStep({ serverId, onGoToDashboard }: CompleteStepProps) {
  const [server, setServer] = useState<ServerInstance | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    serversApi.get(serverId).then((data) => setServer(data.server)).catch(() => {})
  }, [serverId])

  const connectString = server ? `${server.rconHost === '127.0.0.1' ? 'localhost' : server.rconHost}:${server.serverPort}` : ''

  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
        <CheckCircle2 className="h-7 w-7" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-foreground">Server online</h2>
        <p className="mt-1 text-sm text-muted-foreground">{server?.name || 'Your server'} is connected and verified.</p>
      </div>

      {server && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4 text-left">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground">{server.name}</span>
            <Badge variant="success" className="text-xs">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" /> Active
            </Badge>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/50 px-3 py-2">
            <span className="font-mono text-xs text-foreground/85">{connectString}</span>
            <button
              type="button"
              onClick={() => {
                copyText(connectString)
                toast({ title: 'Copied', description: connectString })
              }}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              aria-label="Copy connect string"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-2 text-left sm:grid-cols-3">
        {NEXT_ACTIONS.map(({ to, icon: Icon, label, description }) => (
          <Link key={to} to={to} className="rounded-lg border border-border/60 bg-background/40 p-3 transition-colors hover:border-primary/40 hover:bg-muted/20">
            <Icon className="h-4 w-4 text-primary" />
            <p className="mt-2 text-xs font-semibold text-foreground">{label}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</p>
          </Link>
        ))}
      </div>

      <Button className="w-full onboarding-cta" onClick={onGoToDashboard}>
        <LayoutDashboard className="mr-2 h-4 w-4" /> Go to Dashboard
      </Button>
    </div>
  )
}
