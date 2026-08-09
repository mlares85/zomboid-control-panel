import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ServerCard } from '../dashboard/ServerCard'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ServerInstance } from '@/lib/api'

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

function renderCard(overrides: Partial<ServerInstance> = {}, isRunning = false) {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <ServerCard
          server={{ ...baseServer, ...overrides }}
          isRunning={isRunning}
          activeStatus={null}
          stats={null}
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
})
