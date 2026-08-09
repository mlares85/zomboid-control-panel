import { useEffect, useState } from 'react'
import { Loader2, Plus, Settings2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/EmptyState'
import { backupApi, BackupDestination } from '@/lib/api'
import { BackupFormatComparison } from './BackupFormatComparison'
import { BackupDestinationCard } from './BackupDestinationCard'
import { AddDestinationDialog } from './AddDestinationDialog'
import { BackupHistoryTable } from './BackupHistoryTable'
import { SaveCompactionCard } from './SaveCompactionCard'

function DestinationsTab() {
  const [destinations, setDestinations] = useState<BackupDestination[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  const fetchDestinations = async () => {
    setLoading(true)
    try {
      const data = await backupApi.listDestinations()
      setDestinations(data.destinations || [])
    } catch {
      setDestinations([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDestinations()
  }, [])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Destination
        </Button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : destinations.length === 0 ? (
        <EmptyState
          type="empty"
          compact
          title="No destinations configured"
          description="Backups only go to the local backups folder until you add another destination."
          action={{ label: 'Add Destination', onClick: () => setAddOpen(true), variant: 'outline' }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {destinations.map((destination) => (
            <BackupDestinationCard
              key={destination.id}
              destination={destination}
              onUpdated={fetchDestinations}
              onDeleted={fetchDestinations}
            />
          ))}
        </div>
      )}
      <AddDestinationDialog open={addOpen} onOpenChange={setAddOpen} onAdded={fetchDestinations} />
    </div>
  )
}

// Thin composing wrapper for the enhanced backup features (formats,
// destinations, history, compaction). Kept out of Backups.tsx to stay
// under the 300-line-per-file limit there.
export function BackupAdvancedPanel() {
  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs defaultValue="formats">
          <TabsList className="mb-4 flex-wrap h-auto">
            <TabsTrigger value="formats" className="gap-1.5">
              <Settings2 className="w-3.5 h-3.5" />
              Formats
            </TabsTrigger>
            <TabsTrigger value="destinations">Destinations</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="compaction">Compaction</TabsTrigger>
          </TabsList>
          <TabsContent value="formats">
            <BackupFormatComparison />
          </TabsContent>
          <TabsContent value="destinations">
            <DestinationsTab />
          </TabsContent>
          <TabsContent value="history">
            <BackupHistoryTable />
          </TabsContent>
          <TabsContent value="compaction">
            <SaveCompactionCard />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
