# Architecture Decisions

## Stack

Node.js + Express 5 backend, React 18 + Vite + TypeScript frontend. Socket.IO for real-time. Single JSON file (`db.json`) via lowdb for persistence. Ships as Docker image and standalone Windows/Linux exe via `@yao-pkg/pkg`.

## Server provider types

Server profiles carry a `provider` field: `native` (PZ on the host), `docker-local` (PZ in a separate container, panel has files via bind mounts), `docker-managed` (panel owns the container — future), `remote-sftp` (PZ on a different machine). The legacy `isRemote` boolean is derived from provider. All code that checks "are files locally accessible?" should use `provider !== "remote-sftp"` — both `native` and `docker-local` have local file access.

## Route decomposition pattern

Large route files are split into `routes/{name}/` directories. Each sub-file exports a `register*Routes(router)` function that adds routes to a shared `express.Router()` built in `index.js`. Routes are **not** nested sub-routers — the router stack stays flat so tests that introspect `router.stack` still work. The old file becomes a re-export shim (`export { default } from "./{name}/index.js"`).

## Shared middleware

`server/middleware/` holds reusable guard middleware: `requireRcon`, `requireBridge`, `requireActiveServer`, `requireModChecker`, `panelBridgeGuards`. These replace the copy-pasted inline checks that appeared in ~95+ handlers. Each middleware attaches the validated resource to `req` (e.g., `req.rconService`, `req.activeServer`) so handlers can use it directly.

## PanelBridge file-based IPC

The panel communicates with the in-game PanelBridge Lua mod via filesystem queues, not sockets. Commands written as `inbox/cmd-{seq}.json`, results read from `outbox/res-{seq}.json[.txt]`. The `.txt` suffix is a Build 42 constraint (Lua can only create `.txt` files). Status polled every 1s (Node) / written every 3s (Lua) with `fs.watch` fast path. SFTP transport available for remote servers.

## PanelBridge auto-install

When the panel has local file access to the PZ server (provider `native` or `docker-local`), it automatically copies `PanelBridge.lua` from its own `pz-mod/` directory into the server's `media/lua/server/` on server activation. No SFTP or manual copy needed for local mounts.

## Template system

Templates are portable JSON documents containing sparse SandboxVars + INI overrides (only keys that differ from PZ defaults). `iniExclusions` prevents identity/secret keys (passwords, ports, server name) from traveling in templates. Six built-in templates ship in `server/data/templates/`. Templates support diff-preview against a server's live config before applying. Apply always creates a mandatory backup first.

## Mount discovery

At startup and on demand, `mountDiscovery.js` probes common Docker mount paths (`/pz-server`, `/zomboid`, `/serverdata/serverfiles`) and env-configured paths (`PZ_SERVER_PATH`, `PZ_SAVE_PATH`) for PZ server signatures. When mounts are found but no server profiles exist, a startup banner directs users to connect. `POST /api/servers/create-from-discovery` creates a fully-populated server profile including RCON settings read from the discovered server INI.

Frontend: `MountDiscoveryBanner` (dismissal remembered per install path in localStorage) triggers `DiscoverySetup`, a dialog that re-probes the mount via the existing `POST /servers/detect` (not discover-mounts, which doesn't return per-server RCON fields) to prefill the RCON password/ports for display and `RconTestConnection` before calling create-from-discovery. First-run: `Setup.tsx` sets a `pz-just-completed-setup` sessionStorage flag on successful account creation; `Dashboard.tsx` consumes it once, and if no servers exist yet, auto-opens `DiscoverySetup` instead of landing on an empty dashboard.

## Platform-specific onboarding guidance

`GET /api/system/environment` composes a `platformGuidance` block (`server/services/platformGuidance.js`, pure function) on top of the platform/Docker detection: `canRunNative` (false only on macOS — PZ's dedicated server is Linux-only), `canRunDocker`, `dockerRuntime`, and install `recommendations` (OrbStack/Docker Desktop links, macOS-without-Docker only). Docker runtime detection (`detectDockerRuntime()` in `dockerDetect.js`) shells out cheapest-first — OrbStack CLI, then `docker info` (checked for a "Docker Desktop" marker), then `colima status`, falling back to `native` — and is only invoked when no Docker socket is already bind-mounted (`hasDockerSocket` short-circuits to `"native"`, since shelling out inside a Linux container is pointless). The onboarding wizard's `ServerTypeStep` swaps in a dedicated `MacDockerGuide` screen (install links + remote-server escape hatch) instead of the normal option list when macOS has no Docker; `ConfigureStep`/`CompleteStep` take an optional `platform` prop for Docker-vs-SteamCMD copy and a Windows Firewall port reminder, respectively.

## Env var fallback

`PZ_SERVER_PATH` and `PZ_SAVE_PATH` env vars are consulted at two layers: creation-time (seeds empty fields in the POST body) and read-time (`normalizeServerMemory` falls back to env when db fields are empty/null). The db value always wins when present. `isRemote` is auto-detected based on whether the resolved path exists locally.

## Error handling convention

The codebase uses `{success: boolean, error?: string, detail?: string}` result objects, not thrown errors. A custom ESLint rule (`require-result-handling`) enforces that `{success: false}` results are never silently discarded. Config-dependent errors include a `fixUrl` field pointing to the relevant Settings page so the frontend can render "Fix this →" links. On the client, `ApiError.data` carries the raw error payload; `getErrorFixUrl()` (`lib/errorMessage.ts`) reads `fixUrl` off it, and `errorToastContent()` (`lib/errorToast.tsx`) spreads a `description` + `FixThisAction` toast action in one call — use it (or `getErrorFixUrl` directly, for handlers that already hold a separate message string) instead of hand-rolling the action prop.

## Auth

bcryptjs (cost 12) + JWT access (24h) / refresh (30d, httpOnly cookie). Timing-safe dummy-hash comparison on "user not found" to prevent username enumeration. Account lockout after 10 failures (15 min). SHA-256 hashed recovery codes. `tokenGen` counter invalidates all tokens on password change. RBAC scaffolded (`requireRole()`) but currently single-role (admin).

`requireRole()` is only applied to a subset of routes (backup, RCON, destructive file/chunk/mod operations, docker-managed server management). Player moderation routes (`server/routes/players.js`, `server/routes/panelBridge/players.js`) and server lifecycle routes (start/stop/restart on the active server) have no `requireRole` guard — any authenticated session can call them. This is intentional for the current single-admin model, but it's the first boundary to close when multi-user/moderator roles ship: a moderator role should plausibly get player actions but not lifecycle control (or vice versa), so those two route groups need distinct guards rather than a blanket admin check.

## Data storage

Single `db.json` via lowdb — debounced 500ms writes, atomic (temp + rename), circuit breaker (60s cooldown after 5 failures). Schema versioning at v1. Append-heavy data (events, metrics) should eventually move to separate storage before adding monitoring features. `getCircuitBreakerStatus()` exposes degraded state to the frontend via `/api/system/storage-health`.

## Disk space monitoring

`diskMonitor.js` polls free space on the save volume every 60 seconds. Warning at 90%, critical at 95%. Combined with circuit-breaker status in `/api/system/storage-health`. Frontend renders a persistent banner for critical states (full disk during save = world corruption).

## Socket.IO events

JWT-authenticated in handshake middleware. Room-based pub/sub: `server-status`, `players`, `logs`, `perf`. ~30 event names, currently untyped — a shared event map is planned. Used for live dashboard/console; all commands go over REST.

## Frontend decomposition

Pages are decomposed into `components/{page}/` directories. The main page file becomes a thin shell (tab management + component composition). Shared state extracted into hooks. Target: no file over 300 lines.

## E2E testing

Playwright (`@playwright/test`) with chromium. `e2e/auth.setup.ts` handles both first-run (account creation) and login, saving auth state to `e2e/.auth/user.json` for reuse. Credentials via `E2E_USERNAME`/`E2E_PASSWORD` env vars (defaults: `admin`/`testpassword123`). Specs in `e2e/`: smoke, dashboard, navigation. Run `npx playwright install chromium` once, then `npm run test:e2e`. The dev server (`npm run dev`, Vite on port 5173 proxying to Express on 3001) is started automatically by the Playwright `webServer` config.

## Test environment: localStorage under Node's built-in Storage

On Node versions that ship a built-in global `localStorage` (22+), that global shadows jsdom's Storage implementation in Vitest and every call throws `TypeError: ... is not a function` unless `--localstorage-file` is set. `client/src/test-setup.ts` overrides `globalThis.localStorage` with a minimal in-memory `Storage` for the test environment only — needed by any component test exercising a dismiss-to-localStorage pattern (`MountDiscoveryBanner`, `PlatformGuidanceCard`, etc.).

## Server provider abstraction (in progress)

Server management is being decomposed from the `ServerManager` monolith (1,600+ lines) into a composition-of-capabilities model. Each server record's `provider` field (`native`, `docker-local`, `docker-managed`, `remote-sftp`) maps to a set of capability objects:

```
provider.lifecycle  // launch(), terminate() — null for remote-sftp
provider.files      // readFile(), writeFile(), withSession() — always present
provider.installer  // install(), update() via SteamCMD — null unless installable
provider.stats      // getStats() — null unless containerized
```

Design principles (from Fable 5 review):
- **Composition over fat interface.** Absent capabilities (`lifecycle: null`) are the signal — no stub methods.
- **Orchestration stays in ServerManager.** Restart (RCON warning → save → stop → start), graceful shutdown, INI parsing — all provider-agnostic. Providers expose only `terminate()`.
- **File access is session-aware.** SFTP uses pull-mirror-edit-push with a mirror lock; `withSession(fn)` + `sync()`/`flush()` express this. Local impl makes sessions a no-op.
- **SteamCMD is a separate Installer port**, not a provider method. Base volume population is panel-level state (shared across managed containers), not per-instance. Two adapters: `NativeSteamCmdInstaller` (child process) and `ContainerSteamCmdInstaller` (Docker).
- **Static registry**, not dynamic plugin loading. Each entry declares `isAvailable(env)`, `validateConfig`, and `create(deps, cfg)`.
- **Contract test suite = the interface** (no TS compile-time enforcement in this codebase).

Platform support matrix:
| Platform | Install Method | Lifecycle | File Access |
|----------|---------------|-----------|-------------|
| Windows  | Local steamcmd.exe | Child process (tasklist/taskkill /T) | Direct fs |
| Linux    | Local steamcmd.sh  | Child process (pgrep/kill)           | Direct fs |
| macOS    | Docker via OrbStack | Docker API                          | Volume mounts |
| Any      | Docker managed      | Docker API                          | Volume mounts |
| Any      | Remote server       | None (null lifecycle)               | SFTP mirror |

Migration sequence (strangler fig): (1) characterization tests, (2) extract file access, (3) extract detection, (4) extract lifecycle, (5) SteamCMD/installer last — build new Windows/Linux local-install only on the new interface. Deletion gate: when `_isDockerBacked()` has zero callers, phase 4 is done.

### Lifecycle implementation (step 4 complete)

`server/services/lifecycle/Lifecycle.js` defines the abstract base class (`launch()`, `terminate()`, `isRunning()`). Two concrete adapters:

- **`DockerLifecycle`** — wraps Docker container start/stop with a `_guard()` helper for availability/ref checks. ServerManager delegates `_startDockerContainer` and `_stopDockerContainer` to it, keeping state tracking (`isRunning`, `startTime`) and event logging in the orchestrator.
- **`NativeLifecycle`** — spawns processes via `launch({command, args, cwd, env, logPath})`, kills specific PIDs via `terminate(pids)`, and has a `terminateAll()` fallback (pkill/taskkill). `isRunning()` returns false (known gap — process detection is complex and stays in ServerManager until the provider registry is fully wired). ServerManager delegates `_killPids` and `_genericForceStop` to it.

All deps are injected (spawn, execFile, exec, fs) so both adapters are testable without real processes or Docker sockets.

### Installer implementation (step 5 complete)

**Note:** "step 5 started" from the original migration sequence — renumbered to "complete" since both adapters are built and routes are wired.

`server/services/installer/Installer.js` defines the abstract base class (`install()`, `update()`, `isAvailable()`). Two concrete adapters:

- **`NativeSteamCmdInstaller`** — wraps the SteamCMD child-process logic with concurrent-op guard, LD_LIBRARY_PATH setup, Linux auto-download fallback, and Steam depot access denied detection. `POST /install` and `POST /steam-update` delegate to it (strangler cutover complete); routes still own input validation, HTTP response shape, and post-install orchestration (`completeSuccessfulInstall`, event logging).
- **`ContainerSteamCmdInstaller`** — pulls `steamcmd/steamcmd:latest`, runs it against a named Docker volume, polls container logs for progress, cleans up on completion. Supports branch selection via beta args.

Both report progress via an `onProgress(event, data)` callback (not Socket.IO directly) so they're testable without a live server. Routes bridge the callback to Socket.IO event names (`install:log`, `steam:log`, etc.). `detectInstall.js` scans platform-specific paths for SteamCMD binaries and existing PZ server installs, exposed via `GET /api/server/setup/detect`. `installer/index.js` provides `getNativeInstaller()` factory wired to the real SteamCMD helpers.

Top risks: SFTP mirror lock semantics, losing RCON-save-before-kill during extraction, stale provider instances on server-switch, Windows process tree termination (`.bat` → Java child).

## Deferred decisions

### Docker socket integration
Mount `/var/run/docker.sock` into the panel container (optional). Detect at startup, expose as capability flag. Use `dockerode` for container listing, creation, lifecycle. Restrict operations to containers with `zomboid-panel.managed=true` label. Support `DOCKER_HOST` env var for socket-proxy setups.

### Multi-server connection pool
The scheduler already proves concurrent RCON connections work (temporary instances for background tasks). Promote to a pool keyed by server ID. Dashboard shows all servers with live status.

### Community template registry
Git repo of templates fetched as a static index. PRs as moderation. Import from URL/gist. Out of scope until the template UI ships.

## Backup server snapshots

`backupRecords.js` mutations (`addRecord`, `updateRecord`, `deleteRecord`) are serialized through a module-level promise chain (`mutateRecords`) to prevent concurrent read-modify-write races when e.g. two backup jobs finish simultaneously. Reads (`listRecords`, `getRecord`) are unserialized.

`createEnhancedBackup` (backupOrchestrator.js) embeds a `serverSnapshot` in every backup record via `server/utils/serverSnapshot.js` — server identity, a curated non-secret allowlist of INI/SandboxVars keys (there's no "PZ defaults" table in this codebase to diff a true non-default set against, so this mirrors the debug support bundle's curated-keys approach), the tracked mods list, and best-effort `playerCount`/`worldAge` (via `rconService`/PanelBridge — both optional, never block the backup). Passwords are excluded by allowlist plus a defense-in-depth `/password|secret|token/i` filter. Backup records are filterable by `serverId`/`serverName` (`GET /api/backup/records`), and `GET /api/backup/servers` lists distinct servers for the History table's filter dropdown. `templateActions.js` records `lastAppliedTemplateId`/`lastAppliedTemplateName` on the server profile when a template is applied, so the snapshot can report which template a config came from.

## Container resource stats

`DockerClient.getContainerStats(id)` hits `GET /containers/{id}/stats?stream=false` (a one-shot snapshot, not the streaming variant, which never resolves) and parses it into `{cpu, memory, disk, network}` via the pure `parseContainerStats`/`calculateCpuPercent` helpers (Docker's official CPU% formula: usage delta / system delta * core count). `routes/docker.js` exposes `GET /containers/:id/stats` (single) and `GET /stats` (batch, keyed by both container id and bare name so callers can look up by whichever ref a server profile stored) for the running PZ containers only. `services/containerStatsPoller.js` polls the *active* server's container every 5s and `io.emit`s `container:stats`; like `DiskMonitor`, it re-resolves the active server from the DB on every tick rather than needing explicit start/stop calls wired into the activation route, so it silently goes quiet when the active server isn't Docker-backed. Note: `dockerClient` itself is only ever set on `serverManager`, not `app` — routes/docker.js reads it via `req.app.get("dockerClient")`, so it must also be `app.set()` in index.js or every `/api/docker/*` route silently reports "unavailable" regardless of real socket state (this was a live bug fixed alongside the stats feature).

## Per-server RCON status

`GET /api/servers/rcon-status` probes RCON connectivity for all configured servers using `testRconConnection()` from `rcon.js` (3-second timeout, max 3 concurrent via a worker-pool `mapWithConcurrency` helper). Returns `{ servers: [{ id, status }] }` where status is `"connected"`, `"unavailable"`, or `"unconfigured"`. The route lives in `server/routes/servers/rconStatus.js` and is wired before the `/:id` wildcard in the servers router. Dashboard `ServerCard` components use this to show an RCON signal alongside the host process signal for non-active servers; the active server continues using its full 3-signal composed status from `GET /servers/active/status`.

## Docker-managed containers

`DockerClient` (dockerClient.js) supports full container lifecycle: `createContainer(spec, name)`, `removeContainer(id, force)`, `pullImage(image, tag)`, `inspectImage(imageRef)`, plus volume management: `createVolume(name)`, `inspectVolume(name)`, `removeVolume(name)`. Two higher-level services compose these primitives:

- `dockerVolumeManager.js` — manages a shared base volume (`zomboid-panel-base`, ~3GB of PZ server files) and per-server data volumes (`zomboid-srv-{name}` for config/saves/mods). `ensureBaseVolume()` creates on first use; subsequent servers share it.
- `dockerContainerFactory.js` — builds Docker API container specs with correct volume mounts (`base→/opt/pz-server:ro`, `srv→/opt/pz-data`), port bindings (game UDP + RCON TCP), management labels (`zomboid-panel.managed`, `zomboid-panel.server-id`), and JVM memory env vars. `createManagedServer(config)` orchestrates the full flow: ensure base volume → create server volume → pull image if needed → create container. `findAvailablePorts(existingServers)` auto-assigns non-conflicting game/RCON port pairs.

Default container image is `eclipse-temurin:21-jre` (glibc-based — Alpine won't work because PZ's native libraries require glibc). Custom images are configurable in Advanced Options. Containers run `/opt/pz-server/start-server.sh -servername <name>` with `HOME=/opt/pz-data`. A `zomboid-panel-net` bridge network is auto-created so RCON traffic between the panel and managed servers stays internal. The panel container is auto-connected to this network during server creation so Docker DNS resolves the managed container name for RCON (`rconHost` is the container name, not `127.0.0.1`). Containers get `RestartPolicy: unless-stopped` so they survive Docker daemon restarts and auto-recover from crashes. Creation has rollback: if `startContainer` fails after the container and DB record are created, both are cleaned up. A preflight check validates the base path has `start-server.sh` before creating the container. The `docker-managed` provider type in `serverProvider.js` distinguishes panel-owned containers from externally-created ones (`docker-local`). `DockerClient.watchEvents()` streams container lifecycle events (start/stop/die/oom) via the Docker API and emits them as `docker:event` over Socket.IO for instant UI updates.

All stop/restart call sites — the web `/stop` route, Discord `/stop` command, and scheduler auto-restart — check `serverManager._isDockerBacked()` and route through `serverManager.stopServer(false)` or `dockerClient.restartContainer()` instead of `rconService.quit()`. RCON quit kills PID 1 inside a container, causing the restart policy to revive it (the server never actually stops). `dockerClient._lifecycleAction` reads the container's `Config.StopTimeout` to set a per-action HTTP timeout instead of the flat 8s default (PZ's B42 world save can take 90s+). `docker/entrypoint.sh` preserves supplementary groups (e.g. docker GID for socket access) instead of unconditionally clearing them.

## Docker managed server routes

Managed routes live in `server/routes/docker/managed.js`, mounted at `/api/docker/managed` via `docker.js`. Endpoints: `GET /prerequisites` (Docker socket + base volume check), `GET /available-ports` (next free game/RCON pair), `POST /servers` (full orchestration: volumes → image pull → network → container → server profile → PanelBridge install → start), `DELETE /servers/:id` (container + profile removal), `POST /populate-base` (SteamCMD-in-container download into base volume, progress via Socket.IO), `POST /validate-base-path` (checks if a host path has PZ server files). `pullImage` parses `image:tag` from a combined string and uses a 10-minute timeout for large downloads.

## Base volume population

`baseVolumePopulator.js` downloads PZ server files into the `zomboid-panel-base` Docker volume by running a temporary `steamcmd/steamcmd:latest` container with `+app_update 380870 validate +quit`. Progress is polled every 3 seconds from the container's logs and emitted via Socket.IO (`docker:populate-log` / `docker:populate-complete`). The temp container is auto-removed on completion. Alternative to downloading: bind-mount an existing host path containing PZ server files (e.g., `/mnt/user/appdata/steamcmd/pzserver`), validated by `POST /validate-base-path`.

## Map version checking

`MapVersionChecker` (server/services/mapVersionChecker.js) periodically polls `map.projectzomboid.com` for new PZ map builds. Interval is user-configurable (1h–7d, default 24h) via `GET/PUT /api/map/settings/check-interval`. Emits `map:version-changed` over Socket.IO when a new build is detected. `b42Resolution.js` supports dynamic TTL via `setResolutionTtl()` and exposes `getResolutionState()` / `invalidateResolutionCache()` for the settings route. WorldMap.tsx has a version selector dropdown in the control rail; `mapApi.versions()` fetches available builds and `mapApi.resolve(?version=X)` resolves geometry for a specific one. The `Settings > World Map` tab shows checker status, interval control, and tile cache stats.

## Backup destination selection

Manual backups now support destination selection. `BackupPageHeader` renders a multi-select dropdown when multiple destinations are enabled (local + SFTP/Google Drive). The `useBackupsData` hook tracks `selectedDestinations` and passes them to `createBackup({ destinations })`. The scheduler (`scheduler.js`) queries all enabled destinations via `listDestinations()` instead of hardcoding `["local"]`, so scheduled backups go to SFTP/Google Drive automatically.

## Docker managed container runtime

Managed container specs (`dockerContainerFactory.js`) use an inline bash entrypoint that installs `lib32gcc-s1` + `libstdc++6:i386` on first boot (dpkg check skips on subsequent starts). PZ's native `.so` files require these 32-bit compat libs on glibc-based images like `eclipse-temurin:21-jre`. A `/tmp` tmpfs mount is included in HostConfig. `GET /api/docker/managed/servers/:id/health` inspects container state, restart count, and recent logs for common failures (missing libs, OOM, disk full), returning structured issues with severity and remediation hints.

## E2E test isolation

Playwright's `webServer` command runs `e2e/ensure-ports-free.sh` before `npm run dev` to kill stale processes on 3001/5173. Vite uses `strictPort: true` to fail fast instead of silently shifting ports. `DATA_DIR` env var (read by `server/utils/paths.js`) isolates the test database from production; set `E2E_DATA_DIR` to enable. `reuseExistingServer` is disabled when `E2E_DATA_DIR` is set so the test server uses the isolated DB. The `dashboard` fixture detects login failures via form-scoped alert locators to avoid strict mode violations from unrelated destructive elements on the dashboard.

## Dashboard server cards

`components/dashboard/ServerCards.tsx` renders one compact `ServerCard` per configured server above the main dashboard. Non-active servers now show both a host process signal and an RCON connectivity signal (from `GET /servers/rcon-status`). The active server gets full 3-signal status (host/RCON/bridge) from `GET /servers/active/status`. Cards are clickable without nesting `<button>`s inside `<button>`s: a full-size `<button>` sits absolutely positioned behind a `pointer-events-none` content wrapper, and only the real action buttons opt back in with `pointer-events-auto` — clicks on empty card space fall through to the cover button (switches server), clicks on an action button are captured by that button first.
