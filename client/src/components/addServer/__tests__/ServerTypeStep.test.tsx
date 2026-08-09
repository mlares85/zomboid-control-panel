import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ServerTypeStep } from '../ServerTypeStep'
import type { EnvironmentSnapshot, PlatformGuidance } from '@/lib/api'

function guidance(overrides: Partial<PlatformGuidance> = {}): PlatformGuidance {
  return {
    platform: 'linux',
    canRunNative: true,
    canRunDocker: true,
    dockerRuntime: 'native',
    recommendations: [],
    ...overrides,
  }
}

function environment(overrides: Partial<EnvironmentSnapshot> = {}): EnvironmentSnapshot {
  return {
    platform: 'linux',
    containerized: true,
    hasDockerSocket: true,
    envPaths: { PZ_SERVER_PATH: null, PZ_SAVE_PATH: null },
    discoveredMounts: [],
    serverCount: 0,
    platformGuidance: guidance(),
    ...overrides,
  }
}

describe('ServerTypeStep', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the normal option list on Linux with Docker', () => {
    render(<ServerTypeStep environment={environment()} onSelect={vi.fn()} />)

    expect(screen.getByText('What do you want to do?')).toBeInTheDocument()
    expect(screen.getByText('Create a new server')).toBeInTheDocument()
    expect(screen.getByText('Connect to an existing server')).toBeInTheDocument()
  })

  it('shows the macOS Docker install guide instead of normal options when Docker is missing', () => {
    const env = environment({
      platform: 'darwin',
      platformGuidance: guidance({
        platform: 'darwin',
        canRunNative: false,
        canRunDocker: false,
        dockerRuntime: null,
        recommendations: [
          { type: 'install-docker', label: 'Install OrbStack', url: 'https://orbstack.dev', description: 'x' },
          {
            type: 'install-docker',
            label: 'Install Docker Desktop',
            url: 'https://www.docker.com/products/docker-desktop',
            description: 'y',
          },
        ],
      }),
    })

    render(<ServerTypeStep environment={env} onSelect={vi.fn()} />)

    expect(screen.getByText('🍎 macOS Detected')).toBeInTheDocument()
    expect(screen.getByText('Install OrbStack (Recommended)')).toBeInTheDocument()
    expect(screen.getByText('Install Docker Desktop')).toBeInTheDocument()
    expect(screen.queryByText('What do you want to do?')).not.toBeInTheDocument()
  })

  it('relabels the create option and shows the Docker-detected banner on macOS with Docker', () => {
    const env = environment({
      platform: 'darwin',
      platformGuidance: guidance({ platform: 'darwin', canRunNative: false, dockerRuntime: 'orbstack' }),
    })

    render(<ServerTypeStep environment={env} onSelect={vi.fn()} />)

    expect(screen.getByText('Create Docker Server')).toBeInTheDocument()
    expect(screen.getByText(/Docker detected \(OrbStack\)/)).toBeInTheDocument()
  })

  it('shows the Windows firewall tip and SteamCMD copy on Windows', () => {
    const env = environment({
      platform: 'win32',
      platformGuidance: guidance({ platform: 'win32', dockerRuntime: null, canRunDocker: false }),
    })

    render(<ServerTypeStep environment={env} onSelect={vi.fn()} />)

    expect(screen.getByText(/Allow PZ through Windows Firewall/)).toBeInTheDocument()
    expect(screen.getByText('Install PZ Server')).toBeInTheDocument()
  })
})
