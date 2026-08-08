import { Input } from '@/components/ui/input'
import { SandboxData } from '@/lib/api'

export interface UncategorizedSandboxEntry {
  section: string
  key: string
  value: string | number | boolean
}

// Sandbox settings not covered by the schema (mostly mod-added keys), grouped
// by the section that owns them.
export function SandboxUncategorizedPanel({
  entries,
  groups,
  originalSandboxData,
  onChange,
}: {
  entries: UncategorizedSandboxEntry[]
  groups: Record<string, UncategorizedSandboxEntry[]>
  originalSandboxData: SandboxData | null
  onChange: (section: string, key: string, value: string | number | boolean) => void
}) {
  if (entries.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No uncategorized settings.
      </div>
    )
  }
  return (
    <div>
      <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-baseline justify-between border-b border-amber-500/30 bg-card/95 px-1 pb-2 pt-1 backdrop-blur">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-500">
          Additional Sandbox Settings
        </h3>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {entries.length} key{entries.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Settings the editor has no schema for, grouped by the section that owns them. Mostly mod-added keys. Edit with care.
      </p>
      <div className="space-y-5">
        {Object.entries(groups).map(([groupName, groupEntries]) => (
          <div key={groupName}>
            <div className="mb-1.5 flex items-baseline justify-between border-b border-border/40 pb-1">
              <h4 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {groupName === 'settings' ? 'Main section' : groupName}
              </h4>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{groupEntries.length}</span>
            </div>
            <div className="space-y-1">
              {groupEntries.map(({ section, key, value }) => {
                const origSection = originalSandboxData?.[section as keyof SandboxData]
                const origValue = typeof origSection === 'object' ? (origSection as Record<string, unknown>)?.[key] : undefined
                const isModified = value !== origValue
                return (
                  <div key={`${section}.${key}`} className={`flex items-center justify-between py-2 px-3 rounded-md transition-colors ${isModified ? 'bg-amber-500/10 border border-amber-500/20' : 'hover:bg-muted/50'}`}>
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate" title={key}>{key}</span>
                        {isModified && origValue !== undefined && (
                          <button
                            onClick={() => onChange(section, key, origValue as string | number | boolean)}
                            className="text-xs text-amber-500 hover:text-amber-400"
                            title="Undo change"
                          >↩</button>
                        )}
                      </div>
                    </div>
                    <Input
                      className="w-48 h-8 text-sm flex-shrink-0"
                      value={String(value)}
                      maxLength={500}
                      onChange={e => {
                        const raw = e.target.value
                        let parsed: string | number | boolean = raw
                        if (raw === 'true') parsed = true
                        else if (raw === 'false') parsed = false
                        else if (raw !== '' && !isNaN(Number(raw))) parsed = Number(raw)
                        onChange(section, key, parsed)
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
