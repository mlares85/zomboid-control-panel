import { test, expect } from './integration-fixtures'

test.describe.serial('server lifecycle', () => {
  test.slow()

  test('server appears in My Servers page', async ({ dashboard: page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'My Servers', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Managed Servers' })).toBeVisible({ timeout: 15_000 })

    // At least one server card should be visible with a "Selected" badge
    await expect(page.getByText('Selected').first()).toBeVisible({ timeout: 10_000 })
  })

  test('dashboard shows the server status (online indicator)', async ({ dashboard: page }) => {
    const statusBar = page.getByRole('banner', { name: 'Server status' })
    await expect(statusBar).toBeVisible({ timeout: 15_000 })

    // The status header renders a verdict dot and the server name
    const stopButton = statusBar.getByRole('button', { name: 'Stop', exact: true })
    const startButton = statusBar.getByRole('button', { name: 'Start' })
    await expect(stopButton.or(startButton)).toBeVisible({ timeout: 10_000 })
  })

  test('server can be stopped via dashboard', async ({ dashboard: page }) => {
    const statusBar = page.getByRole('banner', { name: 'Server status' })
    await expect(statusBar).toBeVisible({ timeout: 15_000 })

    const stopButton = statusBar.getByRole('button', { name: 'Stop', exact: true })
    const isRunning = await stopButton.isVisible().catch(() => false)
    test.skip(!isRunning, 'Server is not running — cannot test stop')

    await stopButton.click()

    // Confirmation dialog appears
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await dialog.getByRole('button', { name: /stop/i }).click()

    // Wait for the Start button to appear, indicating the server stopped
    await expect(statusBar.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: 15_000 })
  })

  test('server can be restarted and comes back', async ({ dashboard: page }) => {
    const statusBar = page.getByRole('banner', { name: 'Server status' })
    await expect(statusBar).toBeVisible({ timeout: 15_000 })

    // If stopped from previous test, start it first
    const startButton = statusBar.getByRole('button', { name: 'Start' })
    const isStopped = await startButton.isVisible().catch(() => false)

    if (isStopped) {
      await startButton.click()
      // Wait for Stop button (server is running)
      await expect(statusBar.getByRole('button', { name: 'Stop', exact: true })).toBeVisible({ timeout: 15_000 })
    }

    // Now restart
    const restartButton = statusBar.getByRole('button', { name: 'Restart', exact: true })
    await expect(restartButton).toBeVisible({ timeout: 10_000 })
    await restartButton.click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await dialog.getByRole('button', { name: /restart/i }).click()

    // Server should come back — Stop button reappears
    await expect(statusBar.getByRole('button', { name: 'Stop', exact: true })).toBeVisible({ timeout: 15_000 })
  })
})
