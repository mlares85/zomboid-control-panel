import { Input } from '@/components/ui/input'

export interface UncategorizedIniEntry {
  key: string
  value: string
}

// Keys present in the loaded INI file but not covered by the schema (newer
// vanilla keys, mod-injected keys, or custom). Values are preserved on save.
export function IniUncategorizedPanel({
  entries,
  originalIniSettings,
  onChange,
}: {
  entries: UncategorizedIniEntry[]
  originalIniSettings: Record<string, string>
  onChange: (key: string, value: string) => void
}) {
  if (entries.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No uncategorized keys.
      </div>
    )
  }
  return (
    <div>
      <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-baseline justify-between border-b border-amber-500/30 bg-card/95 px-1 pb-2 pt-1 backdrop-blur">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-500">
          Uncategorized / Unknown Keys
        </h3>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {entries.length} key{entries.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Keys present in your INI but not recognized by the schema. Likely newer vanilla settings or mod-injected. Values are preserved on save — edit with care.
      </p>
      <div className="space-y-1">
        {entries.map(({ key, value }) => {
          const orig = originalIniSettings[key]
          const isModified = orig !== undefined && orig !== value
          return (
            <div key={key} className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 transition-colors ${isModified ? 'border border-amber-500/20 bg-amber-500/10' : 'hover:bg-muted/50'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium" title={key}>{key}</span>
                  {isModified && (
                    <button
                      onClick={() => onChange(key, orig ?? '')}
                      className="text-xs text-amber-500 hover:text-amber-400"
                      title="Undo change"
                    >↩</button>
                  )}
                </div>
              </div>
              <Input
                className="h-8 w-56 text-sm"
                value={value}
                maxLength={500}
                onChange={e => onChange(key, e.target.value)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
