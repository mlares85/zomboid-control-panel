import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { serverApi, type SteamBranch } from '@/lib/api'

const DEFAULT_BRANCHES: SteamBranch[] = [
  { name: 'public', description: 'Stable release (Build 42)' },
  { name: 'b41multiplayer', description: 'Build 41 Multiplayer' },
]

interface BranchSelectorProps {
  value: string
  onChange: (branch: string) => void
  /** SteamCMD path for dynamic branch lookup; falls back to defaults if absent. */
  steamCmdPath?: string
}

function branchLabel(b: SteamBranch) {
  if (b.name === 'public') return 'Build 42 (Stable)'
  return b.description || b.name
}

/** Fetches available Steam branches and renders a version dropdown. */
export function BranchSelector({ value, onChange, steamCmdPath }: BranchSelectorProps) {
  const [branches, setBranches] = useState<SteamBranch[]>(DEFAULT_BRANCHES)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    serverApi
      .getBranches(steamCmdPath)
      .then((data) => {
        if (cancelled) return
        if (data.branches?.length) {
          setBranches(data.branches)
          if (!data.branches.find((b) => b.name === value)) onChange('public')
        }
      })
      .catch(() => {
        /* keep default branches */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [steamCmdPath])

  return (
    <div className="space-y-2">
      <Label className="text-sm">Game Version</Label>
      <Select value={value} onValueChange={onChange} disabled={loading}>
        <SelectTrigger>
          <SelectValue placeholder={loading ? 'Loading versions…' : 'Select game version'} />
        </SelectTrigger>
        <SelectContent>
          {branches.map((b) => (
            <SelectItem key={b.name} value={b.name}>
              <div className="flex flex-col">
                <span>{branchLabel(b)}</span>
                {b.buildId && <span className="text-xs text-muted-foreground">Build: {b.buildId}</span>}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {loading && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking available versions…
        </p>
      )}
    </div>
  )
}
