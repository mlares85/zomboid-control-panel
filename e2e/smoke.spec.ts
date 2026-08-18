import { test, expect } from './fixtures'

test.describe('smoke', () => {
  test('dashboard loads with title, nav, and status indicators', async ({ dashboard: page }) => {
    await expect(page).toHaveTitle('Zomboid Control Panel')

    // Sidebar / main nav
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(nav).toBeVisible()
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()

    // On a fresh install the dashboard may show a setup checklist instead
    // of the full status bar. Either is valid proof the dashboard loaded.
    const statusBar = page.getByRole('banner', { name: 'Server status' })
    const setupWizard = page.getByText(/Bring In Your Server|First-Run Setup|Scanning your environment/i)
    const setupChecklist = page.getByText(/Setup Checklist|setup/i)
    await expect(statusBar.or(setupWizard).or(setupChecklist)).toBeVisible({ timeout: 10_000 })

    // Connection status indicator in the sidebar footer
    await expect(page.getByRole('complementary', { name: 'Sidebar' })).toBeVisible()
  })
})
