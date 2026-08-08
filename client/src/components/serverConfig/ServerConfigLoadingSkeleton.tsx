import { Loader2 } from 'lucide-react'

export function ServerConfigLoadingSkeleton() {
  return (
    <div className="space-y-4 page-transition">
      <div className="rounded-lg border border-border/40 bg-card/40 px-4 py-3 sm:px-5 sm:py-4">
        <div className="h-3 w-20 rounded bg-muted/50 animate-pulse mb-2" />
        <div className="h-6 w-64 rounded bg-muted/60 animate-pulse mb-2" />
        <div className="h-3 w-96 rounded bg-muted/40 animate-pulse" />
      </div>
      <div className="rounded-md border border-border/55 bg-card/85 h-12 animate-pulse" />
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="flex-1 h-9 rounded-md bg-muted/40 animate-pulse" />
        ))}
      </div>
      <div className="rounded-md border border-border/55 bg-card/85 h-[400px] flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground text-xs font-medium">
          <Loader2 className="w-4 h-4 animate-spin" />
          loading configuration…
        </div>
      </div>
    </div>
  )
}
