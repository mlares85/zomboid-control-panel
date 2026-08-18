import { test, expect } from './fixtures'

test.describe('Panel Settings page', () => {
  async function goToSettings(page: import('@playwright/test').Page) {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'Panel Settings', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible({ timeout: 15_000 })
  }

  test('page loads with heading', async ({ dashboard: page }) => {
    await goToSettings(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  })

  test('settings tab list is visible with all sections', async ({ dashboard: page }) => {
    await goToSettings(page)
    const sections = ['General', 'Updates', 'HTTPS', 'Remote access', 'Security', 'RCON', 'PanelBridge', 'Mods & Workshop', 'Backups', 'About']
    for (const label of sections) {
      await expect(page.getByRole('tab', { name: label })).toBeVisible()
    }
  })

  test('General tab content is shown by default', async ({ dashboard: page }) => {
    await goToSettings(page)
    // "Panel Settings" also appears as the nav link label — the "Panel
    // Port" field label is the one unique to this tab's content.
    await expect(page.getByText('Panel Port')).toBeVisible({ timeout: 10_000 })
  })

  test('switching to RCON tab shows RCON content', async ({ dashboard: page }) => {
    await goToSettings(page)
    await page.getByRole('tab', { name: 'RCON' }).click()
    // A broad /RCON/i text match hits several elements on this tab (strict
    // mode violation) — assert on the section's own heading instead.
    await expect(page.getByRole('heading', { name: 'RCON Connection' })).toBeVisible()
  })

  test('switching to Security tab shows security content', async ({ dashboard: page }) => {
    await goToSettings(page)
    await page.getByRole('tab', { name: 'Security' }).click()
    await expect(page.getByRole('heading', { name: 'Security & Authentication' })).toBeVisible()
  })

  test('switching to About tab shows version info', async ({ dashboard: page }) => {
    await goToSettings(page)
    await page.getByRole('tab', { name: 'About' }).click()
    // Version strings also appear in the sidebar brand strip and footer —
    // scope to the About panel and take the first match within it.
    const versionText = page.getByRole('tabpanel', { name: 'About' }).getByText(/v\d+\.\d+/).first()
    await expect(versionText).toBeVisible({ timeout: 10_000 })
  })

  test('save button is visible in header', async ({ dashboard: page }) => {
    await goToSettings(page)
    await expect(page.getByRole('button', { name: /Save Settings|No Unsaved Changes/ })).toBeVisible()
  })

  test('save button is disabled when no changes are pending', async ({ dashboard: page }) => {
    await goToSettings(page)
    await expect(page.getByRole('button', { name: 'No Unsaved Changes' })).toBeDisabled()
  })

  test('tab change updates URL query param', async ({ dashboard: page }) => {
    await goToSettings(page)
    await page.getByRole('tab', { name: 'Backups' }).click()
    await expect(page).toHaveURL(/[?&]tab=backups/)
  })

  test('RCON settings render form fields', async ({ dashboard: page }) => {
    test.skip()  // Requires settings to load from the server
  })
})
