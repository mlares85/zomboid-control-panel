# E2E tests (Playwright)

End-to-end tests for the panel's React UI, driven against a real running instance
(backend + frontend) with a headless browser.

## Running

Browsers aren't installed automatically (kept out of the default install so CI/dev
setup doesn't pull ~1GB of browser binaries unless you actually need them). Install
them once:

```bash
npx playwright install chromium
# or, with OS dependencies too (needed on a bare Linux CI image):
npx playwright install --with-deps chromium
```

Then:

```bash
npm run test:e2e          # headless, CI-style run
npm run test:e2e:ui       # interactive UI mode — best for writing/debugging tests
npm run test:e2e:headed   # headless=false, watch the browser
```

`playwright.config.ts` starts the app for you (`npm run dev`) if nothing is already
listening on the configured URL, and reuses an already-running instance otherwise
(useful if you're already running `npm run dev` in another terminal — much faster
iteration). Reports and traces land in `e2e/test-results/` (gitignored).

### Pointing at a different instance

By default tests run against the Vite dev server started by `npm run dev`
(`http://localhost:5173`, which proxies `/api` and `/socket.io` to the backend on
3001 — see `client/vite.config.ts`). To run against a built app, a Docker container,
or a remote panel instead:

```bash
BASE_URL=http://localhost:3001 npm run test:e2e   # e.g. a built app served by `npm start`
BASE_URL=http://your-panel-host:8080 npm run test:e2e
```

When `BASE_URL` is set, Playwright's `webServer` step is skipped if something is
already answering there (`reuseExistingServer`) — pointing at a remote/Docker
instance just works without also trying to spawn `npm run dev` locally.

## How auth works

The panel gates almost everything behind login, so a real session has to exist
before the other specs run. `playwright.config.ts` defines two projects:

1. **`setup`** — runs `e2e/auth.setup.ts` once. It navigates to `/` and handles
   whichever screen the panel shows:
   - **First run** (no admin account yet): fills out the Setup form and submits it.
   - **Login**: signs in with the test credentials.
   - **Already authenticated**: no-ops (covers re-running against an instance that
     kept its refresh-token cookie from a previous run).

   It then saves the resulting browser storage state (the httpOnly refresh-token
   cookie — the in-memory access token isn't persisted, but the cookie is enough to
   auto-login again) to `e2e/.auth/user.json`.
2. **`chromium`** — the actual test project. It depends on `setup` and loads
   `e2e/.auth/user.json` as its `storageState`, so every spec in this project starts
   already signed in.

`e2e/fixtures.ts` re-exports Playwright's `test`/`expect` plus a `dashboard`
fixture — a page already navigated to `/` with the post-login sidebar visible —
so specs don't each repeat that boilerplate. Import from `./fixtures`, not
`@playwright/test`, in new spec files.

### Test credentials

```bash
E2E_USERNAME=my_test_admin
E2E_PASSWORD='a-strong-test-password-123!'
npm run test:e2e
```

Defaults to `e2e_admin` / `E2eTestPassword123!` if unset. On a fresh panel (no
`data/db.json` yet, or one with no users) these credentials also become the admin
account created via Setup — so the first E2E run against a clean instance
provisions its own login. Against an existing panel with a different admin account
already configured, set these to match that account instead.

`e2e/.auth/user.json` is gitignored — it's a live session token, not something to
commit.

## Adding new tests

- New spec files go in `e2e/*.spec.ts` and are picked up automatically
  (`testDir: './e2e'` in `playwright.config.ts`).
- Import `test`/`expect` from `./fixtures`, not `@playwright/test` directly, so new
  specs get the `dashboard` fixture and stay on the authenticated `chromium`
  project.
- Prefer role/label locators (`getByRole`, `getByLabel`) over CSS selectors — they
  match how the app's existing accessibility attributes (`aria-label`, `role`,
  labeled form fields) are already used throughout the client, and are far less
  brittle against style/markup changes.
- If a test depends on server/game state that a fresh CI environment won't have
  (e.g. a PZ server actually running), gate it with `test.skip(condition, reason)`
  rather than asserting on state that may not exist — see the "Stop"/"Restart"
  confirmation tests in `dashboard.spec.ts` for the pattern.
