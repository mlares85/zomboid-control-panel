import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlatformGuidanceCard } from '../PlatformGuidanceCard'
import type { PlatformGuidance } from '@/lib/api'

function guidance(overrides: Partial<PlatformGuidance> = {}): PlatformGuidance {
  return {
    platform: 'darwin',
    canRunNative: false,
    canRunDocker: false,
    dockerRuntime: null,
    recommendations: [],
    ...overrides,
  }
}

describe('PlatformGuidanceCard', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders download recommendations with links that open in a new tab', () => {
    render(
      <PlatformGuidanceCard
        guidance={guidance({
          recommendations: [
            { type: 'install-docker', label: 'Install OrbStack', url: 'https://orbstack.dev', description: 'x' },
          ],
        })}
      />,
    )

    const link = screen.getByRole('link', { name: /Install OrbStack/ })
    expect(link).toHaveAttribute('href', 'https://orbstack.dev')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('shows the detected Docker runtime name when Docker is available', () => {
    render(<PlatformGuidanceCard guidance={guidance({ canRunDocker: true, dockerRuntime: 'orbstack' })} />)

    expect(screen.getByText(/Docker detected \(OrbStack\)/)).toBeInTheDocument()
  })

  it('renders nothing once dismissed, and persists the dismissal', () => {
    const { rerender } = render(
      <PlatformGuidanceCard guidance={guidance({ canRunDocker: true, dockerRuntime: 'native' })} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/Docker detected/)).not.toBeInTheDocument()
    expect(localStorage.getItem('pz-platform-guidance-dismissed-darwin')).toBe('true')

    rerender(<PlatformGuidanceCard guidance={guidance({ canRunDocker: true, dockerRuntime: 'native' })} />)
    expect(screen.queryByText(/Docker detected/)).not.toBeInTheDocument()
  })

  it('renders nothing when there is nothing to say (no Docker, no recommendations)', () => {
    const { container } = render(<PlatformGuidanceCard guidance={guidance({ platform: 'win32' })} />)
    expect(container.firstChild).toBeNull()
  })
})
