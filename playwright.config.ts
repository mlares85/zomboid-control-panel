import { defineConfig, devices } from '@playwright/test'

/**
 * E2E config.
 *
 * The panel's real default port is 3001 (see .env.example / server/index.js),
 * served by Express once the client is built. `npm run dev` instead runs the
 * Vite dev server (client) on 5173 alongside the API/socket server on 3001,
 * with Vite proxying /api and /socket.io to it (client/vite.config.ts). That
 * dev server is what these tests exercise, so BASE_URL defaults to 5173
 * rather than the production port. Override with BASE_URL / PORT env vars to
 * point at a different instance (e.g. a built app or a Docker container).
 */
const PORT = process.env.PORT || '5173'
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  outputDir: 'e2e/test-results',
  reporter: [
    ['html', { outputFolder: 'e2e/html-report', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Logs in (or completes first-run setup) once and saves storage state
    // for every other project to reuse — see e2e/auth.setup.ts.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Starts the dev server (backend + Vite) for the test run. Skipped
  // automatically if something is already listening on BASE_URL.
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, NODE_ENV: 'test' },
  },
})
