import { test, expect } from './fixtures'

/**
 * Smoke tests for every remaining page in the app. Each describe block
 * navigates via the sidebar nav link (matching the exact label from
 * Layout.tsx) and asserts the page loaded with its heading and key UI.
 */

test.describe('Mod Manager', () => {
  test('page loads with heading', async ({ dashboard: page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'Mod Manager', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Mod Manager' })).toBeVisible()
  })

  test('search input is present', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Mod Manager', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Mod Manager' })).toBeVisible()
    // The search box only renders once at least one mod is tracked — on a
    // fresh install the "no mods tracked yet" empty state shows instead.
    const content = page.getByRole('searchbox')
      .or(page.getByPlaceholder(/search/i))
      .or(page.getByText(/no mods tracked/i))
    await expect(content.first()).toBeVisible({ timeout: 10_000 })
  })

  test('mod list or empty state renders', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Mod Manager', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Mod Manager' })).toBeVisible()
    // Either a mod list with items or an empty state message
    const content = page.locator('[data-testid="mod-list"]')
      .or(page.getByText(/no mods/i))
      .or(page.getByText(/add.*mod/i))
      .or(page.getByRole('list'))
    await expect(content.first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Servers', () => {
  test('page loads with heading', async ({ dashboard: page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'My Servers', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Managed Servers' })).toBeVisible()
  })

  test('server list or empty state renders', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'My Servers', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Managed Servers' })).toBeVisible()
    // Either server cards or the "No Servers Configured" onboarding
    const content = page.getByText('No Servers Configured')
      .or(page.getByText(/RCON/i))
    await expect(content.first()).toBeVisible({ timeout: 10_000 })
  })

  test('Add Server button is present', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'My Servers', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Managed Servers' })).toBeVisible()
    // The page always has an "Add Server" action — either in the header or onboarding cards
    const addAction = page.getByRole('button', { name: /add server/i })
      .or(page.getByRole('button', { name: /add existing server/i }))
    await expect(addAction.first()).toBeVisible()
  })
})

test.describe('Server Setup', () => {
  test('page loads with heading', async ({ dashboard: page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'Server Setup', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Server Setup' })).toBeVisible()
  })

  test('setup mode selection cards render', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Server Setup', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Server Setup' })).toBeVisible()
    // Mode selection: Fresh Install, Use Existing Files, Docker Server.
    // Match the card headings specifically — "Fresh Install" also appears as
    // plain text in the "not sure which to choose?" hint below the cards.
    await expect(page.getByRole('heading', { name: 'Fresh Install' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Use Existing Files' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Docker Server' })).toBeVisible()
  })
})

test.describe('Server Finder', () => {
  test('page loads with heading', async ({ dashboard: page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'Browse Public', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Browse Public Servers' })).toBeVisible({ timeout: 15_000 })
  })

  test('search input renders', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Browse Public', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Browse Public Servers' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByPlaceholder(/search/i)).toBeVisible()
  })

  test('server list or loading state visible', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Browse Public', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Browse Public Servers' })).toBeVisible()
    // Either loading spinner, server rows, empty state, or API key warning
    const content = page.getByText(/loading servers/i)
      .or(page.getByText('Server List'))
      .or(page.getByText(/no public servers/i))
      .or(page.getByText(/steam api key/i))
    await expect(content.first()).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Discord', () => {
  test('page loads with heading containing Discord', async ({ dashboard: page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'Discord', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: /Discord Bot/i })).toBeVisible({ timeout: 15_000 })
  })

  test('bot status or setup wizard renders', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Discord', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: /Discord Bot/i })).toBeVisible({ timeout: 15_000 })
    // Either the setup wizard or the management view with bot status
    const content = page.getByText('Create a Discord Application')
      .or(page.getByText('Bot Status'))
      .or(page.getByText(/running/i))
      .or(page.getByText(/stopped/i))
    await expect(content.first()).toBeVisible({ timeout: 10_000 })
  })

  test('configure or start/stop controls present', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Discord', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: /Discord Bot/i })).toBeVisible({ timeout: 15_000 })
    // Either wizard navigation buttons or management start/stop
    const controls = page.getByRole('button', { name: /start bot/i })
      .or(page.getByRole('button', { name: /stop bot/i }))
      .or(page.getByRole('button', { name: /next/i }))
      .or(page.getByRole('button', { name: /save.*start/i }))
    await expect(controls.first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Map Cleanup', () => {
  test('page loads with heading', async ({ dashboard: page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'Map Cleanup', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Map Cleanup' })).toBeVisible()
  })

  test('UI renders with controls or requires-server state', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Map Cleanup', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Map Cleanup' })).toBeVisible()
    // Either map/chunk controls or a "no save" / "select a save" state
    const content = page.getByText(/chunk/i)
      .or(page.getByText(/save/i))
      .or(page.getByText(/no.*server/i))
      .or(page.getByText(/select/i))
    await expect(content.first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Console', () => {
  test('page loads with heading', async ({ dashboard: page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'Server Console', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Console' })).toBeVisible()
  })

  test('command input or empty state is present', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Server Console', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Console' })).toBeVisible()
    // Either the RCON command input or a "no active server" empty state
    const content = page.getByPlaceholder(/command/i)
      .or(page.getByText(/no active server/i))
      .or(page.getByRole('textbox'))
    await expect(content.first()).toBeVisible({ timeout: 10_000 })
  })

  test('tab navigation is present', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Server Console', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Console' })).toBeVisible()
    // Server log and RCON tabs (or empty state replaces them)
    const tabs = page.getByRole('tab')
      .or(page.getByText(/server log/i))
      .or(page.getByText(/rcon/i))
      .or(page.getByText(/no active server/i))
    await expect(tabs.first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Players', () => {
  test('page loads with heading', async ({ dashboard: page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'Online Players', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Players' })).toBeVisible()
  })

  test('player list or offline state renders', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Online Players', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Players' })).toBeVisible()
    // Either player list, "no players online", or offline/no-server state
    const content = page.getByText(/no players/i)
      .or(page.getByText(/online/i))
      .or(page.getByText(/roster/i))
      .or(page.getByText(/no active server/i))
    await expect(content.first()).toBeVisible({ timeout: 10_000 })
  })

  test('search input is present', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Online Players', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Players' })).toBeVisible()
    const search = page.getByPlaceholder(/search/i)
      .or(page.getByRole('searchbox'))
      .or(page.getByText(/no active server/i))
    await expect(search.first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Chat', () => {
  test('page loads with heading', async ({ dashboard: page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'In-Game Chat', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'In-Game Chat' })).toBeVisible()
  })

  test('message input is present', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'In-Game Chat', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'In-Game Chat' })).toBeVisible()
    // Message input or no-server empty state
    const input = page.getByPlaceholder(/message/i)
      .or(page.getByRole('textbox'))
      .or(page.getByText(/no active server/i))
    await expect(input.first()).toBeVisible({ timeout: 10_000 })
  })

  test('chat stream area renders', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'In-Game Chat', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'In-Game Chat' })).toBeVisible()
    const stream = page.getByText(/chat stream/i)
      .or(page.getByText(/no chat messages/i))
      .or(page.getByText(/no active server/i))
    await expect(stream.first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Events', () => {
  test('page loads with heading', async ({ dashboard: page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'Events & Weather', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Event Console' })).toBeVisible()
  })

  test('event controls or requires-connection state renders', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Events & Weather', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Event Console' })).toBeVisible()
    // Either weather/world controls or a connection-required state
    const content = page.getByText(/weather/i)
      .or(page.getByText(/world/i))
      .or(page.getByText(/requires/i))
      .or(page.getByText(/bridge/i))
      .or(page.getByText(/no active server/i))
    await expect(content.first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('World Map', () => {
  test('page loads with heading', async ({ dashboard: page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'World Map', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'World Map' })).toBeVisible()
  })

  test('map container or no-data state renders', async ({ dashboard: page }) => {
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'World Map', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'World Map' })).toBeVisible()
    // Either a canvas map, zoom controls, or no-data/no-server state
    const content = page.locator('canvas')
      .or(page.getByRole('button', { name: /zoom/i }))
      .or(page.getByText(/no.*map/i))
      .or(page.getByText(/no active server/i))
      .or(page.getByText(/bridge/i))
    await expect(content.first()).toBeVisible({ timeout: 10_000 })
  })
})
