import { test as base, expect, type Page } from '@playwright/test'

/**
 * Auth itself is handled by project config: the `chromium` project (see
 * playwright.config.ts) depends on the `setup` project and loads its
 * storage state (e2e/.auth/user.json, written by e2e/auth.setup.ts), so any
 * test using this `test` already starts signed in.
 *
 * This file adds a small `dashboard` fixture — a Page already navigated to
 * "/" with the post-login shell (sidebar nav) visible — so spec files don't
 * each repeat the same wait.
 */
export const test = base.extend<{ dashboard: Page }>({
  dashboard: async ({ page }, use) => {
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({ timeout: 15_000 })
    await use(page)
  },
})

export { expect }
