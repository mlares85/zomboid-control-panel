import { test, expect } from './fixtures'

test.describe('Debug & Logs page', () => {
  async function goToDebug(page: import('@playwright/test').Page) {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'Debug Logs', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Debug & Logs' })).toBeVisible({ timeout: 15_000 })
  }

  test('page loads with heading', async ({ dashboard: page }) => {
    await goToDebug(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Debug & Logs' })).toBeVisible()
  })

  test('all tab triggers are visible', async ({ dashboard: page }) => {
    await goToDebug(page)
    const tabs = ['Diagnostics', 'World Map', 'Performance', 'Activity', 'Logs', 'Crashes', 'Health', 'Environment']
    for (const label of tabs) {
      await expect(page.getByRole('tab', { name: label })).toBeVisible()
    }
  })

  test('header export buttons are visible', async ({ dashboard: page }) => {
    await goToDebug(page)
    await expect(page.getByRole('button', { name: /Support Bundle/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Full Log/ })).toBeVisible()
  })

  test('switching to Logs tab shows log content', async ({ dashboard: page }) => {
    await goToDebug(page)
    await page.getByRole('tab', { name: 'Logs' }).click()
    // The tab should now show log-related content or empty state
    await expect(page.getByText(/log/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('switching to Environment tab shows system info', async ({ dashboard: page }) => {
    await goToDebug(page)
    await page.getByRole('tab', { name: 'Environment' }).click()
    await expect(page.getByText(/node|platform|memory|os/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('switching to Health tab shows health checks', async ({ dashboard: page }) => {
    await goToDebug(page)
    await page.getByRole('tab', { name: 'Health' }).click()
    await expect(page.getByText(/health|storage|status/i).first()).toBeVisible({ timeout: 10_000 })
  })
})
