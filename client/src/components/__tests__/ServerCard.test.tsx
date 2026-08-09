import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ServerCard } from '../dashboard/ServerCard'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ServerInstance, ContainerStats } from '@/lib/api'

const baseServer: ServerInstance = {
  id: 1,
  name: 'Survival Server',
  serverName: 'survival',
  installPath: '/servers/survival',
  zomboidDataPath: null,
  serverConfigPath: null,
  rconHost: '127.0.0.1',
  rconPort: 27015,
  rconPassword: 'secret',
  serverPort: 16261,
  minMemory: 2,
  maxMemory: 4,
  useNoSteam: false,
  useDebug: false,
  isRemote: false,
  isActive: false,
  startCommand: '',
  adminPassword: '',
  createdAt: new Date().toISOString(),
}

function renderCard(
  overrides: Partial<ServerInstance> = {},
  isRunning = false,
  containerStats: ContainerStats | null = null,
) {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <ServerCard
          server={{ ...baseServer, ...overrides }}
          isRunning={isRunning}
          activeStatus={null}
          stats={null}
          containerStats={containerStats}
          onChanged={() => {}}
        />
      </TooltipProvider>
    </MemoryRouter>,
  )
}

describe('ServerCard', () => {
  it('renders the server name and host status pill', () => {
    renderCard({ name: 'Survival Server' }, true)
    expect(screen.getByText('Survival Server')).toBeInTheDocument()
    expect(screen.getByText('Process Up')).toBeInTheDocument()
  })

  it('shows the Selected indicator only for the active server', () => {
    renderCard({ isActive: true })
    expect(screen.getByText('Selected')).toBeInTheDocument()
  })

  it('disables Start and enables Stop when the server is running', () => {
    renderCard({}, true)
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Stop' })).not.toBeDisabled()
  })

  it('disables Stop and enables Start when the server is stopped', () => {
    renderCard({}, false)
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Start' })).not.toBeDisabled()
  })

  it('disables Restart when the server is stopped', () => {
    renderCard({}, false)
    expect(screen.getByRole('button', { name: 'Restart' })).toBeDisabled()
  })

  it('disables Backup for remote servers', () => {
    renderCard({ isRemote: true }, true)
    expect(screen.getByRole('button', { name: 'Backup' })).toBeDisabled()
  })

  it('omits the container resource stats line when none is provided', () => {
    renderCard({}, true, null)
    expect(screen.queryByText(/CPU \d+%/)).not.toBeInTheDocument()
  })

  it('renders CPU/RAM/disk when container stats are provided', () => {
    renderCard({}, true, {
      cpu: { usagePercent: 12.4, cores: 4 },
      memory: { used: 2.1 * 1024 * 1024 * 1024, limit: 4 * 1024 * 1024 * 1024, usagePercent: 52.5 },
      disk: { read: 800 * 1024 * 1024, write: 400 * 1024 * 1024 },
      network: { rxBytes: 0, txBytes: 0 },
    })
    expect(screen.getByText('CPU 12% · RAM 2.1/4.0GB · Disk 1.17 GB')).toBeInTheDocument()
  })
})
