import { useEffect, useState } from 'react'
import { BarChart3, Loader2, RefreshCw, Trophy } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/EmptyState'
import { backupApi, BackupFormatInfo, FormatCompareResult } from '@/lib/api'
import { formatBytes, formatMs } from './formatUtils'
import { cn } from '@/lib/utils'

// Renders one format's row in the comparison bar list, scaled against the
// largest compressed size in the result set so bars are visually comparable.
function FormatRow({ result, label, maxSize, isSmallest }: {
  result: FormatCompareResult
  label: string
  maxSize: number
  isSmallest: boolean
}) {
  const widthPercent = result.compressedSize && maxSize > 0
    ? Math.max(4, Math.round((result.compressedSize / maxSize) * 100))
    : 0

  if (!result.available) {
    return (
      <div className="space-y-1 opacity-50" title={result.error || 'Format unavailable on this server'}>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{result.error || 'Not available'}</span>
        </div>
        <div className="h-2.5 rounded-full bg-muted/50" />
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium flex items-center gap-1.5">
          {label}
          {isSmallest && (
            <Badge variant="success" className="gap-1 px-1.5 py-0 text-[10px]">
              <Trophy className="w-2.5 h-2.5" />
              Smallest
            </Badge>
          )}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {result.compressedSize != null ? formatBytes(result.compressedSize) : '—'}
          {result.ratio ? ` · ${result.ratio}` : ''}
          {result.timeMs != null ? ` · ${formatMs(result.timeMs)}` : ''}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-muted/50 overflow-hidden">
        <div
          className={cn('h-full rounded-full', isSmallest ? 'bg-primary' : 'bg-primary/50')}
          style={{ width: `${widthPercent}%` }}
        />
      </div>
    </div>
  )
}

export function BackupFormatComparison() {
  const [formats, setFormats] = useState<BackupFormatInfo[]>([])
  const [comparing, setComparing] = useState(false)
  const [results, setResults] = useState<FormatCompareResult[] | null>(null)
  const [sampleSizeBytes, setSampleSizeBytes] = useState<number | null>(null)
  const [failureMessage, setFailureMessage] = useState<string | null>(null)

  useEffect(() => {
    backupApi.getFormats().then((data) => setFormats(data.formats || [])).catch(() => setFormats([]))
  }, [])

  const runComparison = async () => {
    setComparing(true)
    setFailureMessage(null)
    try {
      const data = await backupApi.compareFormats()
      if (data.success) {
        setResults(data.results)
        setSampleSizeBytes(data.sampleSizeBytes)
      } else {
        setResults(null)
        setFailureMessage(data.message || 'No save is configured to sample from yet.')
      }
    } catch (error) {
      setResults(null)
      setFailureMessage(error instanceof Error ? error.message : 'Failed to compare formats')
    } finally {
      setComparing(false)
    }
  }

  const labelFor = (id: string) => formats.find((f) => f.id === id)?.label || id

  const smallestFormat = results?.length
    ? results.filter((r) => r.available && r.compressedSize != null)
        .reduce<FormatCompareResult | null>((min, r) => (!min || (r.compressedSize! < min.compressedSize!) ? r : min), null)
    : null

  const maxSize = results?.length
    ? Math.max(...results.filter((r) => r.available && r.compressedSize != null).map((r) => r.compressedSize!), 0)
    : 0

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Format Comparison
            </CardTitle>
            <CardDescription>
              Compresses a real sample of your save with each format and compares size vs. speed.
            </CardDescription>
          </div>
          <Button onClick={runComparison} disabled={comparing} size="sm" className="gap-2 self-start sm:self-auto">
            {comparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {comparing ? 'Comparing…' : results ? 'Re-run Comparison' : 'Run Comparison'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!results && !comparing && !failureMessage && (
          <p className="text-sm text-muted-foreground">
            {formats.length > 0
              ? `${formats.length} format${formats.length === 1 ? '' : 's'} available: ${formats.map((f) => f.label).join(', ')}. Run a comparison to see real numbers for your save.`
              : 'Run a comparison to see size and speed for each available format.'}
          </p>
        )}
        {comparing && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!comparing && failureMessage && (
          <EmptyState
            type="noData"
            compact
            title="Comparison unavailable"
            description={failureMessage}
            action={{ label: 'Try Again', onClick: runComparison, variant: 'outline' }}
          />
        )}
        {!comparing && results && results.length > 0 && (
          <div className="space-y-4">
            {sampleSizeBytes != null && (
              <p className="text-xs text-muted-foreground">Sample size: {formatBytes(sampleSizeBytes)}</p>
            )}
            <div className="space-y-3">
              {results.map((result) => (
                <FormatRow
                  key={result.format}
                  result={result}
                  label={labelFor(result.format)}
                  maxSize={maxSize}
                  isSmallest={smallestFormat?.format === result.format}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
