import { Link } from 'react-router-dom'
import { Server, FolderOpen, Globe, X } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STEPS = [
  ['1', 'Bring in a server', 'Add an existing install, connect remote RCON, or create a new server.'],
  ['2', 'Verify connectivity', 'Confirm paths, RCON credentials, and active server.'],
  ['3', 'Reach live control', 'When status, players, and chat update, live control is ready.'],
] as const

export function QuickStartGuide({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className="relative mt-3 overflow-hidden rounded-lg border border-primary/30 bg-card/50 px-4 py-4">
      <button
        onClick={onDismiss}
        aria-label="Dismiss quick start guide"
        className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/85">First server</p>
      <h2 className="mt-1 text-lg font-semibold leading-tight text-foreground">
        Get one server up, RCON working, then layer on the rest.
      </h2>
      <ol className="mt-4 grid gap-2 list-none p-0 md:grid-cols-3">
        {STEPS.map(([n, title, body]) => (
          <li key={n} className="rounded-md border border-border/50 bg-background/40 p-3">
            <p className="text-sm font-semibold text-foreground">
              <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold bg-primary/15 text-primary" aria-hidden="true">{n}</span>
              {title}
            </p>
            <p className="mt-1 pl-[1.4rem] text-xs leading-5 text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/server-setup" className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'h-8 gap-1.5 text-xs')}>
          <Server className="h-3.5 w-3.5" /> Install new server
        </Link>
        <Link to="/servers" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 gap-1.5 text-xs')}>
          <FolderOpen className="h-3.5 w-3.5" /> Add existing server
        </Link>
        <Link to="/servers" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'h-8 gap-1.5 text-xs')}>
          <Globe className="h-3.5 w-3.5" /> Add remote server
        </Link>
      </div>
    </section>
  )
}
