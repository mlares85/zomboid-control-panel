import { test, expect } from './fixtures'

// path -> the page's own <h1> text (via PageHeader, or a bare <h1> on pages
// that predate it). Kept in sync with client/src/components/Layout.tsx nav
// labels and each page's PageHeader `title` prop.
const ROUTES: { navLabel: string; path: string; heading: string | RegExp }[] = [
  { navLabel: 'Server Console', path: '/console', heading: 'Console' },
  { navLabel: 'Online Players', path: '/players', heading: 'Players' },
  { navLabel: 'In-Game Chat', path: '/chat', heading: 'In-Game Chat' },
  { navLabel: 'Events & Weather', path: '/events', heading: 'Event Console' },
  { navLabel: 'World Map', path: '/world-map', heading: 'World Map' },
  { navLabel: 'Server Configuration', path: '/server-config', heading: 'Server Configuration' },
  { navLabel: 'Mod Manager', path: '/mods', heading: 'Mod Manager' },
  { navLabel: 'Templates', path: '/templates', heading: 'Simulation Templates' },
  { navLabel: 'Scheduled Tasks', path: '/scheduler', heading: 'Scheduler' },
  { navLabel: 'World Backups', path: '/backups', heading: 'World Backups' },
  { navLabel: 'Map Cleanup', path: '/chunks', heading: 'Map Cleanup' },
  { navLabel: 'My Servers', path: '/servers', heading: 'Managed Servers' },
  { navLabel: 'Server Setup', path: '/server-setup', heading: 'Server Setup' },
  { navLabel: 'Browse Public', path: '/server-finder', heading: 'Browse Public Servers' },
  { navLabel: 'Discord', path: '/discord', heading: /Discord Bot/ },
  { navLabel: 'Panel Settings', path: '/settings', heading: 'Settings' },
  { navLabel: 'Debug Logs', path: '/debug', heading: 'Debug & Logs' },
]

test.describe('navigation', () => {
  test('Dashboard nav link is active on load', async ({ dashboard: page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  })

  for (const { navLabel, path, heading } of ROUTES) {
    test(`sidebar link "${navLabel}" navigates to ${path} and shows its heading`, async ({ dashboard: page }) => {
      const nav = page.getByRole('navigation', { name: 'Main navigation' })
      await nav.getByRole('link', { name: navLabel, exact: true }).click()

      await expect(page).toHaveURL(new RegExp(`${path}$`))
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({ timeout: 15_000 })
      await expect(nav.getByRole('link', { name: navLabel, exact: true })).toHaveAttribute('aria-current', 'page')
    })
  }
})
