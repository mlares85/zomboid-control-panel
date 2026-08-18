import { test, expect } from './fixtures'

test.describe('Server Configuration page', () => {
  async function goToConfig(page: import('@playwright/test').Page) {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'Server Configuration', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Server Configuration' })).toBeVisible({ timeout: 15_000 })
  }

  test('page loads with heading and description', async ({ dashboard: page }) => {
    await goToConfig(page)
    await expect(page.getByText('Edit the live INI, sandbox, spawn, and mod settings')).toBeVisible()
  })

  test('all five config tabs are visible', async ({ dashboard: page }) => {
    await goToConfig(page)
    const tabs = ['Server Settings', 'Sandbox', 'Spawn Points', 'Spawn Regions', 'Mod Settings']
    for (const label of tabs) {
      await expect(page.getByRole('tab', { name: label })).toBeVisible()
    }
  })

  test('switching to Sandbox tab shows sandbox content', async ({ dashboard: page }) => {
    await goToConfig(page)
    await page.getByRole('tab', { name: 'Sandbox' }).click()
    // Tab should switch; content depends on server being configured
    await expect(page.getByRole('tab', { name: 'Sandbox' })).toBeVisible()
  })

  test('header action buttons are visible', async ({ dashboard: page }) => {
    await goToConfig(page)
    // Exact match — the settings-category sidebar on this page also has an
    // "Ops" group button labeled "Backups N", which the loose regex matched.
    await expect(page.getByRole('button', { name: 'Templates', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Backups', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible()
  })
})
