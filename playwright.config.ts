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
    // --- Auth setup (shared by all browser projects) ---
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },

    // --- UI smoke tests (no Docker required) ---
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // --- Integration: Docker lifecycle ---
    // Spins up a real PZ server via the managed-server API, runs *.spec.ts
    // tests against it, then tears it down.
    //
    // Prerequisites:
    //   - Docker available on the host
    //   - Base volume populated (run populate-base in the panel UI first)
    //
    // Run with: npm run test:e2e:integration
    {
      name: 'docker-setup',
      testMatch: /docker-setup\.ts/,
      testDir: './e2e/integration',
      dependencies: ['setup'],
    },
    {
      name: 'docker-teardown',
      testMatch: /docker-teardown\.ts/,
      testDir: './e2e/integration',
    },
    {
      name: 'integration',
      testDir: './e2e/integration',
      testMatch: '**/*.spec.ts',
      timeout: 60_000,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['docker-setup'],
      teardown: 'docker-teardown',
    },
  ],

  // Starts the dev server (backend + Vite) for the test run. Skipped
  // automatically if something is already listening on BASE_URL.
  // The ensure-ports-free.sh script kills stale processes on 3001/5173
  // so the server doesn't hit EADDRINUSE and silently fail.
  // DATA_DIR isolates the test database from production data so the
  // auth setup can safely create its own admin account.
  webServer: {
    command: 'sh e2e/ensure-ports-free.sh && npm run dev',
    url: BASE_URL,
    timeout: 60_000,
    // Reuse an existing dev server in local mode, but NOT when running
    // with an isolated test data dir (E2E_DATA_DIR) — the tests need the
    // server that's using the test database, not a stale one.
    reuseExistingServer: !process.env.CI && !process.env.E2E_DATA_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      // When E2E_DATA_DIR is set, the server uses an isolated database
      // so the auth setup can create its own admin account from scratch.
      // Unset by default so local runs reuse the existing dev data.
      ...(process.env.E2E_DATA_DIR ? { DATA_DIR: process.env.E2E_DATA_DIR } : {}),
    },
  },
})
