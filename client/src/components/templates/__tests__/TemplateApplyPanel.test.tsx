import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TemplateApplyPanel } from '../TemplateApplyPanel'

const baseProps = {
  scopeIni: true,
  scopeSandbox: true,
  onScopeIniChange: vi.fn(),
  onScopeSandboxChange: vi.fn(),
  applying: false,
  applyError: null,
  applyResult: null,
  running: false,
  canApply: true,
  onApply: vi.fn(),
  onClose: vi.fn(),
}

function renderPanel(overrides: Partial<typeof baseProps> = {}) {
  return render(
    <TooltipProvider>
      <TemplateApplyPanel {...baseProps} {...overrides} />
    </TooltipProvider>,
  )
}

describe('TemplateApplyPanel', () => {
  it('shows running warning when server is running', () => {
    renderPanel({ running: true })

    expect(screen.getByText('Server is running')).toBeInTheDocument()
  })

  it('hides running warning when server is stopped', () => {
    renderPanel({ running: false })

    expect(screen.queryByText('Server is running')).not.toBeInTheDocument()
  })

  it('enables apply when stopped and scopes selected', () => {
    renderPanel({ running: false })

    expect(screen.getByRole('button', { name: 'Apply Template' })).toBeEnabled()
  })

  it('disables apply when canApply is false', () => {
    renderPanel({ canApply: false })

    const btn = screen.getByRole('button', { name: 'Apply Template' })
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(baseProps.onApply).not.toHaveBeenCalled()
  })

  it('disables apply when no scopes are selected', () => {
    renderPanel({ scopeIni: false, scopeSandbox: false })

    expect(screen.getByRole('button', { name: 'Apply Template' })).toBeDisabled()
  })

  it('disables apply while applying', () => {
    renderPanel({ applying: true })

    expect(screen.getByRole('button', { name: 'Apply Template' })).toBeDisabled()
  })
})
