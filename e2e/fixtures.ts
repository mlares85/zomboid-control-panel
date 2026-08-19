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
      // Wait for either successful login (nav appears) or a login error alert.
      // Use a login-form-scoped error locator to avoid matching unrelated
      // destructive elements (e.g. disconnected RCON icons) on the dashboard.
      const loginError = page.getByRole('alert').filter({ hasText: /couldn.*sign|invalid|incorrect/i })
      await expect(nav.or(loginError)).toBeVisible({ timeout: 15_000 })
      if (await loginError.isVisible().catch(() => false)) {
        throw new Error(
          `E2E login failed for "${USERNAME}". Ensure the test account exists ` +
          `(set E2E_USERNAME/E2E_PASSWORD, or delete data/db.json to start fresh).`
        )
      }
    }

    // Persist the current session so the next test's context starts from a
    // valid cookie. The refresh token rotates on every use (old one is
    // revoked server-side), so even when this test authenticated via the
    // silent cookie refresh — not the login form above — the storage state
    // on disk is now stale. Without rewriting it here, the next test to load
    // e2e/.auth/user.json would present an already-revoked refresh token,
    // fail its own silent refresh, and land on the login screen mid-test.
    await context.storageState({ path: authFile })

    await use(page)
  },
})

export { expect }
