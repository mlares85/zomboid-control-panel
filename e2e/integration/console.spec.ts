import { test, expect } from './integration-fixtures'

test.describe('console', () => {
  async function goToConsole(page: import('@playwright/test').Page) {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'Console', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Console' })).toBeVisible({ timeout: 15_000 })
  }

  test('console page loads and shows RCON tab', async ({ dashboard: page }) => {
    await goToConsole(page)

    // Switch to RCON tab where the command input lives
    await page.getByRole('tab', { name: /rcon console/i }).click()
    await expect(page.getByLabel('RCON command input')).toBeVisible({ timeout: 10_000 })
  })

  test('type "help" and submit — output appears', async ({ dashboard: page }) => {
    test.slow()
    await goToConsole(page)
    await page.getByRole('tab', { name: /rcon console/i }).click()

    const input = page.getByLabel('RCON command input')
    await expect(input).toBeVisible({ timeout: 10_000 })

    await input.fill('help')
    await page.getByRole('button', { name: 'Execute command' }).click()

    // RCON output area should show the command and its response
    const outputArea = page.getByRole('log', { name: 'RCON command output' })
    await expect(outputArea.getByText('help')).toBeVisible({ timeout: 15_000 })
  })

  test('type "players" and submit — output appears', async ({ dashboard: page }) => {
    test.slow()
    await goToConsole(page)
    await page.getByRole('tab', { name: /rcon console/i }).click()

    const input = page.getByLabel('RCON command input')
    await expect(input).toBeVisible({ timeout: 10_000 })

    await input.fill('players')
    await page.getByRole('button', { name: 'Execute command' }).click()

    // Output may say "Players connected" or "No players connected"
    const outputArea = page.getByRole('log', { name: 'RCON command output' })
    await expect(outputArea.getByText(/players/i)).toBeVisible({ timeout: 15_000 })
  })
})
