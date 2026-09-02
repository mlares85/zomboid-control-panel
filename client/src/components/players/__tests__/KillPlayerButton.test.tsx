import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { KillPlayerButton } from '../KillPlayerButton'
import { panelBridgeApi } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  panelBridgeApi: { killPlayer: vi.fn() },
}))

function renderButton(onKilled = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <KillPlayerButton username="Bandit42" onKilled={onKilled} />
    </QueryClientProvider>,
  )
  return { onKilled }
}

describe('KillPlayerButton', () => {
  beforeEach(() => {
    vi.mocked(panelBridgeApi.killPlayer).mockReset()
  })

  it('keeps the confirm action disabled until the username is typed exactly', () => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: /kill/i }))

    const confirmButton = screen.getByRole('button', { name: 'Kill Player' })
    expect(confirmButton).toBeDisabled()

    const input = screen.getByLabelText(/type.*to confirm/i)
    fireEvent.change(input, { target: { value: 'wrong-name' } })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(input, { target: { value: 'Bandit42' } })
    expect(confirmButton).toBeEnabled()
  })

  it('calls killPlayer and the onKilled callback on confirm', async () => {
    vi.mocked(panelBridgeApi.killPlayer).mockResolvedValue({ success: true })
    const { onKilled } = renderButton()

    fireEvent.click(screen.getByRole('button', { name: /kill/i }))
    fireEvent.change(screen.getByLabelText(/type.*to confirm/i), { target: { value: 'Bandit42' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kill Player' }))

    await waitFor(() => expect(panelBridgeApi.killPlayer).toHaveBeenCalledWith('Bandit42'))
    await waitFor(() => expect(onKilled).toHaveBeenCalled())
  })

  it('shows an error toast and keeps the dialog open when the kill fails', async () => {
    vi.mocked(panelBridgeApi.killPlayer).mockRejectedValue(new Error('Bridge not running'))
    renderButton()

    fireEvent.click(screen.getByRole('button', { name: /kill/i }))
    fireEvent.change(screen.getByLabelText(/type.*to confirm/i), { target: { value: 'Bandit42' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kill Player' }))

    await waitFor(() => expect(panelBridgeApi.killPlayer).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Kill Player' })).toBeInTheDocument()
  })
})
