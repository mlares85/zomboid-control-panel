import { useState, useEffect, useCallback } from 'react'
import {
  Map,
  RefreshCw,
  HardDrive,
  Clock,
  Loader2,
  Check,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { mapApi } from '@/lib/api'
import type { MapSettings as MapSettingsData } from '@/lib/api'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function formatRelativeTime(ts: number | null): string {
  if (!ts) return 'Never'
  const diff = Date.now() - ts
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

export function MapSettings() {
  const { toast } = useToast()
  const [data, setData] = useState<MapSettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [intervalHours, setIntervalHours] = useState(24)

  const fetchSettings = useCallback(async () => {
    try {
      const settings = await mapApi.settings()
      setData(settings)
      if (settings.checker) {
        setIntervalHours(Math.round(settings.checker.intervalMs / 3_600_000))
      }
    } catch {
      // best-effort
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const handleCheckNow = async () => {
    setChecking(true)
    try {
      const result = await mapApi.checkNow()
      if (result.success) {
        toast({
          title: 'Map check complete',
          description: `Current version: ${result.version}`,
        })
        await fetchSettings()
      }
    } catch {
      toast({ title: 'Check failed', variant: 'destructive' })
    } finally {
      setChecking(false)
    }
  }

  const handleSaveInterval = async () => {
    const hours = Math.max(1, Math.min(168, intervalHours))
    setSaving(true)
    try {
      const result = await mapApi.setCheckInterval(hours)
      if (result.success) {
        toast({
          title: 'Interval updated',
          description: `Checking every ${result.intervalHours}h`,
        })
        setIntervalHours(result.intervalHours)
        await fetchSettings()
      }
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Version checking */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="w-4 h-4" />
            Version Checking
          </CardTitle>
          <CardDescription>
            Periodically check map.projectzomboid.com for new PZ map builds.
            When a new version is detected, you'll be notified on the World Map page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current status */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs">Current version</span>
              <div className="font-mono font-medium">
                {data?.checker?.currentVersion || data?.resolution?.currentDirectory || '—'}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs">Last checked</span>
              <div className="font-mono font-medium">
                {formatRelativeTime(data?.checker?.lastCheckAt ?? null)}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs">Available versions</span>
              <div className="font-mono font-medium">
                {data?.checker?.availableVersions?.filter((v) => /^4[2-9]/.test(v.directory)).length ?? 0}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs">Last version change</span>
              <div className="font-mono font-medium">
                {formatRelativeTime(data?.checker?.lastChangeAt ?? null)}
              </div>
            </div>
          </div>

          {/* Check interval control */}
          <div className="flex items-end gap-3 pt-2 border-t border-border/40">
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="map-check-interval" className="text-xs flex items-center gap-1.5">
                Check interval
                <span className="text-muted-foreground/60" title="How often to check for new PZ map builds (1–168 hours)">ⓘ</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="map-check-interval"
                  type="number"
                  min={1}
                  max={168}
                  value={intervalHours}
                  onChange={(e) => setIntervalHours(parseInt(e.target.value) || 24)}
                  className="w-20 font-mono tabular-nums"
                />
                <span className="text-xs text-muted-foreground">hours</span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveInterval}
              disabled={saving || intervalHours === Math.round((data?.checker?.intervalMs ?? 86_400_000) / 3_600_000)}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckNow}
              disabled={checking}
              className="gap-1.5"
            >
              {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Check now
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tile cache stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="w-4 h-4" />
            Tile Cache
          </CardTitle>
          <CardDescription>
            Map tiles are cached locally so they load instantly on repeat visits.
            Tiles are immutable per PZ build — once cached, they never need to be re-downloaded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs">Cached tiles</span>
              <div className="font-mono font-medium text-lg tabular-nums">
                {data?.cache?.files?.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs">Cache size</span>
              <div className="font-mono font-medium text-lg tabular-nums">
                {formatBytes(data?.cache?.totalBytes ?? 0)}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs">Build directories</span>
              <div className="font-mono font-medium text-lg tabular-nums">
                {data?.cache?.directories ?? 0}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            <Map className="w-3 h-3 inline-block mr-1 -mt-0.5" />
            Cache grows as you explore new areas. No expiration needed — each PZ build's tiles are permanent.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
