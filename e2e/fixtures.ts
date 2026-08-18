import { test as base, expect, type Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authFile = path.join(__dirname, '.auth', 'user.json')

const USERNAME = process.env.E2E_USERNAME || 'e2e_admin'
const PASSWORD = process.env.E2E_PASSWORD || 'E2eTestPassword123!'

/**
 * `dashboard` fixture — navigates to "/" and ensures the authenticated shell
 * (sidebar nav) is visible.  If the storage-state cookie has gone stale
 * (e.g. the server regenerated its JWT secret), the fixture signs in via the
 * login form and updates the saved storage state so subsequent tests skip
 * the login round-trip entirely.
 */
export const test = base.extend<{ dashboard: Page }>({
  dashboard: async ({ page, context }, use) => {
    await page.goto('/')

    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    const loginHeading = page.getByRole('heading', { name: 'Sign in' })

    await expect(nav.or(loginHeading)).toBeVisible({ timeout: 15_000 })

    if (await loginHeading.isVisible().catch(() => false)) {
      await page.getByLabel('Username').fill(USERNAME)
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
      await page.getByRole('button', { name: /^sign in$/i }).click()
      await expect(nav).toBeVisible({ timeout: 15_000 })
      // Persist the fresh session so later tests skip the login form
      await context.storageState({ path: authFile })
    }

    await use(page)
  },
})

export { expect }
