import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PlayerVitals } from '../PlayerVitals'
import { panelBridgeApi, type PlayerVitalsDetail } from '@/lib/api'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, panelBridgeApi: { getPlayerDetails: vi.fn() } }
})

function renderVitals(username = 'Bandit42') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <PlayerVitals username={username} />
    </QueryClientProvider>,
  )
}

const fullDetail: PlayerVitalsDetail = {
  username: 'Bandit42',
  displayName: 'Bandit42',
  x: 1, y: 2, z: 0,
  accessLevel: 'none',
  isAlive: true,
  stats: { hunger: 0.2, thirst: 0.1, fatigue: 0.05 },
  health: { overallBodyHealth: 80, isBleeding: true, isInfected: false, wetness: 0.3 },
}

describe('PlayerVitals', () => {
  beforeEach(() => {
    vi.mocked(panelBridgeApi.getPlayerDetails).mockReset()
  })

  it('renders health/hunger/thirst/fatigue bars and the bleeding badge', async () => {
    vi.mocked(panelBridgeApi.getPlayerDetails).mockResolvedValue({ success: true, data: fullDetail })
    renderVitals()

    await waitFor(() => expect(screen.getByText('Health')).toBeInTheDocument())
    expect(screen.getByText('Hunger')).toBeInTheDocument()
    expect(screen.getByText('Thirst')).toBeInTheDocument()
    expect(screen.getByText('Fatigue')).toBeInTheDocument()
    expect(screen.getByText('Bleeding')).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
  })

  it('shows an unavailable message when the player has no live stats (offline)', async () => {
    vi.mocked(panelBridgeApi.getPlayerDetails).mockResolvedValue({
      success: true,
      data: { username: 'Ghost', displayName: 'Ghost', x: 0, y: 0, z: 0, accessLevel: 'none', isAlive: false },
    })
    renderVitals('Ghost')

    await waitFor(() => expect(screen.getByText(/Live vitals aren't available/i)).toBeInTheDocument())
  })

  it('shows a retry option on error', async () => {
    vi.mocked(panelBridgeApi.getPlayerDetails).mockRejectedValue(new Error('Bridge not running'))
    renderVitals()

    await waitFor(() => expect(screen.getByText('Bridge not running')).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
