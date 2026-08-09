import { useEffect, useState } from 'react'
import { CheckCircle2, History, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/ui/use-toast'
import { backupApi, BackupRecord } from '@/lib/api'
import { formatBytes, formatDate, truncateChecksum } from './formatUtils'
import { cn } from '@/lib/utils'

function VerifiedBadge({ verified }: { verified: boolean | null }) {
  if (verified === null) return <Badge variant="secondary">Not verified</Badge>
  if (verified) return <Badge variant="success" className="gap-1"><CheckCircle2 className="w-3 h-3" />Verified</Badge>
  return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Failed</Badge>
}

export function BackupHistoryTable() {
  const { toast } = useToast()
  const [records, setRecords] = useState<BackupRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  // Tracks optimistic/confirmed verification results per record id, separate
  // from BackupRecord.verified so a re-run before the initial fetch settles
  // doesn't get clobbered.
  const [verifiedOverride, setVerifiedOverride] = useState<Record<string, boolean>>({})

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const data = await backupApi.listRecords()
      setRecords(data.records || [])
    } catch {
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
  }, [])

  const handleVerify = async (id: string) => {
    setVerifyingId(id)
    setVerifiedOverride((prev) => ({ ...prev, [id]: true })) // optimistic
    try {
      const result = await backupApi.verifyBackup(id)
      setVerifiedOverride((prev) => ({ ...prev, [id]: result.verified }))
      if (!result.verified) {
        toast({ title: 'Verification Failed', description: result.message || 'Checksum or archive integrity check failed.', variant: 'destructive' })
      }
    } catch (error) {
      setVerifiedOverride((prev) => ({ ...prev, [id]: false }))
      toast({ title: 'Verification Failed', description: error instanceof Error ? error.message : 'Failed to verify backup', variant: 'destructive' })
    } finally {
      setVerifyingId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="w-5 h-5" />
              Backup History
            </CardTitle>
            <CardDescription>
              New-format backups tracked with checksums and destinations. This is separate from the legacy backup
              list above, which does not carry this metadata.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchRecords} disabled={loading} className="gap-2 self-start sm:self-auto">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : records.length === 0 ? (
          <EmptyState
            type="noData"
            compact
            title="No metadata-tracked backups yet"
            description="Backups created with the enhanced format (checksums, verification, destinations) will show up here. See the backup list above for existing legacy backups."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border/50">
                  <th className="py-2 pr-3 font-medium">Timestamp</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Format</th>
                  <th className="py-2 pr-3 font-medium">Size</th>
                  <th className="py-2 pr-3 font-medium">Ratio</th>
                  <th className="py-2 pr-3 font-medium">Checksum</th>
                  <th className="py-2 pr-3 font-medium">Verified</th>
                  <th className="py-2 pr-3 font-medium">Destination</th>
                  <th className="py-2 pr-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const verified = verifiedOverride[record.id] ?? (record.verified || null)
                  return (
                    <tr key={record.id} className="border-b border-border/30 last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap">{formatDate(record.timestamp)}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={record.type === 'full' ? 'default' : 'secondary'}>{record.type}</Badge>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{record.format}</td>
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                        {formatBytes(record.originalSize)} → {formatBytes(record.compressedSize)}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{record.compressionRatio}</td>
                      <td className="py-2 pr-3 font-mono text-xs" title={record.checksum}>{truncateChecksum(record.checksum)}</td>
                      <td className="py-2 pr-3"><VerifiedBadge verified={verified} /></td>
                      <td className="py-2 pr-3 truncate max-w-[10rem]" title={record.destination}>{record.destination}</td>
                      <td className="py-2 pr-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleVerify(record.id)}
                          disabled={verifyingId === record.id}
                          className="h-8 gap-1.5"
                        >
                          {verifyingId === record.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          Verify
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
