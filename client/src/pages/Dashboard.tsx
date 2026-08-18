import { useState } from 'react'
import { RefreshCw, LayoutGrid, Monitor, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardData } from '@/hooks/dashboard/useDashboardData'
import { DiscoverySetup } from '@/components/DiscoverySetup'
import { SetupChecklist } from '@/components/SetupChecklist'
import { ServerCards } from '@/components/dashboard/ServerCards'
import { VerdictBand } from '@/components/dashboard/DashboardVerdict'
import { StatusHeader } from '@/components/dashboard/StatusHeader'
import { PanelUpdateBanner, ErrorBanner, NotConfiguredBanner } from '@/components/dashboard/DashboardBanners'
import { QuickStartGuide } from '@/components/dashboard/QuickStartGuide'
import { LiveActivityFeed } from '@/components/dashboard/LiveActivityFeed'
import { TelemetrySection } from '@/components/dashboard/TelemetrySection'
import { WorkSidebar } from '@/components/dashboard/WorkSidebar'
import { ConfirmDialog } from '@/components/dashboard/ConfirmDialog'
import { WipeDialog } from '@/components/dashboard/WipeDialog'
import type { ConfirmAction, WipePreview } from '@/components/dashboard/types'

export default function Dashboard() {
  const d = useDashboardData()

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [wipeDialog, setWipeDialog] = useState(false)
  const [wipeTargets, setWipeTargets] = useState<Record<string, boolean>>({ map: true, players: true, world: true, accounts: false })
  const [wipePreview, setWipePreview] = useState<WipePreview | null>(null)

  const handleDrillIn = () => d.changeView('classic')

  /* ── loading ─────────────────────────────────────────────────────── */
  if (d.initialLoading) {
    return (
      <div className="page-transition">
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Establishing link…</p>
        </div>
      </div>
    )
  }

  /* ── render ──────────────────────────────────────────────────────── */
  return (
    <div className="page-transition pb-12">
      {/* View toggle */}
      <div className="mb-3 flex items-center justify-between gap-3">
        {d.view === 'classic' && d.serverCount != null && d.serverCount > 1 ? (
          <button type="button" onClick={() => d.changeView('cards')}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 rounded-sm">
            <ChevronLeft className="h-3.5 w-3.5" /> All servers
          </button>
        ) : <span aria-hidden="true" />}
        <ViewToggle view={d.view} onChange={d.changeView} />
      </div>

      {d.view === 'cards' ? (
        <ServerCards onDrillIn={handleDrillIn} />
      ) : (
      <>
        <StatusHeader
          verdict={d.verdict} activeServer={d.activeServer} status={d.status}
          online={d.online} hasServer={d.hasServer} loading={d.loading}
          players={d.players} panelInfo={d.panelInfo}
          onAction={d.handleAction} onConfirm={setConfirmAction}
          onConnect={d.handleConnect} onRefresh={d.fetchStatus}
          onRefreshMaintenance={d.fetchMaintenance}
          onOpenWipe={() => { setWipePreview(null); setWipeDialog(true) }}
        />

        {d.panelUpdate && (
          <PanelUpdateBanner panelUpdate={d.panelUpdate}
            dismissedVersion={d.panelUpdateDismissedVersion}
            onDismiss={d.dismissPanelUpdate} />
        )}
        {d.fetchError && <ErrorBanner error={d.fetchError} onRetry={d.fetchStatus} />}
        <NotConfiguredBanner status={d.status} />

        <div className="mt-3"><SetupChecklist /></div>

        {!d.hasServer && d.showQuickStart && <QuickStartGuide onDismiss={d.dismissQuickStart} />}

        <VerdictBand verdict={d.verdict} players={d.presence} showPresence={d.online}
          lastUpdated={d.lastUpdated} stale={d.staleLink} />

        <div className="mt-6 grid content-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
          <main className="grid min-w-0 content-start gap-4 2xl:grid-cols-2 2xl:items-start">
            <LiveActivityFeed activity={d.playerActivity} online={d.online} status={d.status} />
            <TelemetrySection history={d.performanceHistory} online={d.online}
              showCharts={d.showPerformanceCharts} maxMemoryGB={d.maxMemoryGB} />
          </main>

          <WorkSidebar
            workItems={d.workItems} online={d.online} status={d.status}
            bridgeStatus={d.bridgeStatus} activeServer={d.activeServer}
            lastUpdated={d.lastUpdated} loading={d.loading} hasServer={d.hasServer}
            autoStartServer={d.autoStartServer}
            onAction={d.handleAction} onRefresh={d.fetchStatus}
            onRefreshMaintenance={d.fetchMaintenance}
            onAutoStartChange={d.handleAutoStartChange}
            onOpenWipe={() => { setWipePreview(null); setWipeDialog(true) }}
          />
        </div>
      </>
      )}

      <ConfirmDialog action={confirmAction} onClose={() => setConfirmAction(null)}
        onConfirm={async (a) => { await d.handleAction(a.title, a.action); setConfirmAction(null) }} />

      <WipeDialog open={wipeDialog} onClose={() => { setWipeDialog(false); setWipePreview(null) }}
        activeServer={d.activeServer} targets={wipeTargets} onTargetsChange={setWipeTargets}
        preview={wipePreview} onPreviewChange={setWipePreview} />

      <DiscoverySetup open={!!d.autoDiscoveryMount} onOpenChange={(open) => !open && d.setAutoDiscoveryMount(null)}
        mount={d.autoDiscoveryMount} onCreated={() => d.fetchStatus()} />
    </div>
  )
}

function ViewToggle({ view, onChange }: { view: 'cards' | 'classic'; onChange: (v: 'cards' | 'classic') => void }) {
  return (
    <div className="ml-auto flex items-center gap-1 rounded-lg border border-border/50 p-0.5">
      <button type="button" onClick={() => onChange('cards')} aria-label="Cards view" aria-pressed={view === 'cards'} title="Cards view"
        className={cn('rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70', view === 'cards' && 'bg-muted text-foreground')}>
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => onChange('classic')} aria-label="Classic view" aria-pressed={view === 'classic'} title="Classic view"
        className={cn('rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70', view === 'classic' && 'bg-muted text-foreground')}>
        <Monitor className="h-4 w-4" />
      </button>
    </div>
  )
}
