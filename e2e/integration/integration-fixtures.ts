import { test as base, expect, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authFile = path.join(__dirname, '..', '.auth', 'user.json')
const stateFile = path.join(__dirname, '.docker-state.json')

const USERNAME = process.env.E2E_USERNAME || 'e2e_admin'
const PASSWORD = process.env.E2E_PASSWORD || 'E2eTestPassword123!'

interface DockerState {
  serverId: string
  containerId: string
  token: string
}

function loadDockerState(): DockerState {
  const raw = fs.readFileSync(stateFile, 'utf-8')
  return JSON.parse(raw) as DockerState
}

/**
 * Integration test fixture — identical auth flow to e2e/fixtures.ts,
 * plus a `dockerState` fixture that loads .docker-state.json so specs
 * can reference the live server's id, container id, and API token.
 */
export const test = base.extend<{ dashboard: Page; dockerState: DockerState }>({
  dockerState: async ({}, use) => {
    const state = loadDockerState()
    await use(state)
  },

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
      await context.storageState({ path: authFile })
    }

    await use(page)
  },
})

export { expect }
