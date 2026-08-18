import { test as setup, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authFile = path.join(__dirname, '.auth', 'user.json')

// Credentials for the account this suite logs in with. On a fresh panel
// (no users yet) these are also used to create the admin account via the
// Setup screen. Override via env vars to point at an already-provisioned
// test instance.
export const E2E_USERNAME = process.env.E2E_USERNAME || 'e2e_admin'
export const E2E_PASSWORD = process.env.E2E_PASSWORD || 'E2eTestPassword123!'

/**
 * Runs once before the `chromium` project (see playwright.config.ts
 * `dependencies`). The panel shows one of three screens on load:
 *   - Setup (`needsSetup`): no admin account exists yet — create one.
 *   - Login: an account exists — sign in with the test credentials.
 *   - Dashboard: already authenticated (e.g. re-running against a panel
 *     that kept its refresh-token cookie) — nothing to do.
 * Whichever path runs, the resulting storage state (access token is kept
 * in memory by the app, so what matters here is the httpOnly refresh
 * cookie) is saved for every other test to reuse.
 */
setup('authenticate', async ({ page }) => {
  await page.goto('/')

  const setupHeading = page.getByRole('heading', { name: 'Create Admin Account' })
  const loginHeading = page.getByRole('heading', { name: 'Sign in' })
  const dashboardHeader = page.getByRole('banner', { name: 'Server status' })

  await expect(setupHeading.or(loginHeading).or(dashboardHeader)).toBeVisible({ timeout: 15_000 })

  if (await dashboardHeader.isVisible().catch(() => false)) {
    await page.context().storageState({ path: authFile })
    return
  }

  if (await setupHeading.isVisible().catch(() => false)) {
    await page.getByLabel('Username').fill(E2E_USERNAME)
    await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD)
    await page.getByLabel('Confirm Password').fill(E2E_PASSWORD)
    await page.getByRole('button', { name: /create account/i }).click()
  } else {
    await page.getByLabel('Username').fill(E2E_USERNAME)
    await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD)
    await page.getByRole('button', { name: /^sign in$/i }).click()
  }

  // After login/signup the app lands on the dashboard — either the full
  // StatusHeader (returning user) or the first-run SetupChecklist (fresh
  // install). Both render inside the authenticated shell with the sidebar
  // nav, so wait for that instead of the status banner specifically.
  const authedShell = dashboardHeader
    .or(page.getByRole('navigation', { name: 'Main navigation' }))
  await expect(authedShell).toBeVisible({ timeout: 15_000 })
  await page.context().storageState({ path: authFile })
})
