import { test, expect } from './fixtures'

test.describe('smoke', () => {
  test('dashboard loads with title, nav, and status indicators', async ({ dashboard: page }) => {
    await expect(page).toHaveTitle('Zomboid Control Panel')

    // Sidebar / main nav
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(nav).toBeVisible()
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()

    // Top status bar — server name heading + status dot (see Dashboard.tsx header)
    const statusBar = page.getByRole('banner', { name: 'Server status' })
    await expect(statusBar).toBeVisible()
    await expect(statusBar.getByRole('heading')).toBeVisible()

    // Connection status indicator in the sidebar footer
    await expect(page.getByRole('complementary', { name: 'Sidebar' })).toBeVisible()
  })
})
