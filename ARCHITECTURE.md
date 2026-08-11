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

## Data storage

Single `db.json` via lowdb — debounced 500ms writes, atomic (temp + rename), circuit breaker (60s cooldown after 5 failures). Schema versioning at v1. Append-heavy data (events, metrics) should eventually move to separate storage before adding monitoring features. `getCircuitBreakerStatus()` exposes degraded state to the frontend via `/api/system/storage-health`.

## Disk space monitoring

`diskMonitor.js` polls free space on the save volume every 60 seconds. Warning at 90%, critical at 95%. Combined with circuit-breaker status in `/api/system/storage-health`. Frontend renders a persistent banner for critical states (full disk during save = world corruption).

## Socket.IO events

JWT-authenticated in handshake middleware. Room-based pub/sub: `server-status`, `players`, `logs`, `perf`. ~30 event names, currently untyped — a shared event map is planned. Used for live dashboard/console; all commands go over REST.

## Frontend decomposition

Pages are decomposed into `components/{page}/` directories. The main page file becomes a thin shell (tab management + component composition). Shared state extracted into hooks. Target: no file over 300 lines.

## Test environment: localStorage under Node's built-in Storage

On Node versions that ship a built-in global `localStorage` (22+), that global shadows jsdom's Storage implementation in Vitest and every call throws `TypeError: ... is not a function` unless `--localstorage-file` is set. `client/src/test-setup.ts` overrides `globalThis.localStorage` with a minimal in-memory `Storage` for the test environment only — needed by any component test exercising a dismiss-to-localStorage pattern (`MountDiscoveryBanner`, `PlatformGuidanceCard`, etc.).

## Deferred decisions

### Docker socket integration
Mount `/var/run/docker.sock` into the panel container (optional). Detect at startup, expose as capability flag. Use `dockerode` for container listing, creation, lifecycle. Restrict operations to containers with `zomboid-panel.managed=true` label. Support `DOCKER_HOST` env var for socket-proxy setups.

### Multi-server connection pool
The scheduler already proves concurrent RCON connections work (temporary instances for background tasks). Promote to a pool keyed by server ID. Dashboard shows all servers with live status.

### Community template registry
Git repo of templates fetched as a static index. PRs as moderation. Import from URL/gist. Out of scope until the template UI ships.

## Backup server snapshots

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

## Docker managed server routes

Managed routes live in `server/routes/docker/managed.js`, mounted at `/api/docker/managed` via `docker.js`. Endpoints: `GET /prerequisites` (Docker socket + base volume check), `GET /available-ports` (next free game/RCON pair), `POST /servers` (full orchestration: volumes → image pull → network → container → server profile → PanelBridge install → start), `DELETE /servers/:id` (container + profile removal), `POST /populate-base` (SteamCMD-in-container download into base volume, progress via Socket.IO), `POST /validate-base-path` (checks if a host path has PZ server files). `pullImage` parses `image:tag` from a combined string and uses a 10-minute timeout for large downloads.

## Base volume population

`baseVolumePopulator.js` downloads PZ server files into the `zomboid-panel-base` Docker volume by running a temporary `steamcmd/steamcmd:latest` container with `+app_update 380870 validate +quit`. Progress is polled every 3 seconds from the container's logs and emitted via Socket.IO (`docker:populate-log` / `docker:populate-complete`). The temp container is auto-removed on completion. Alternative to downloading: bind-mount an existing host path containing PZ server files (e.g., `/mnt/user/appdata/steamcmd/pzserver`), validated by `POST /validate-base-path`.

## Dashboard server cards

`components/dashboard/ServerCards.tsx` renders one compact `ServerCard` per configured server above the main dashboard. Non-active servers now show both a host process signal and an RCON connectivity signal (from `GET /servers/rcon-status`). The active server gets full 3-signal status (host/RCON/bridge) from `GET /servers/active/status`. Cards are clickable without nesting `<button>`s inside `<button>`s: a full-size `<button>` sits absolutely positioned behind a `pointer-events-none` content wrapper, and only the real action buttons opt back in with `pointer-events-auto` — clicks on empty card space fall through to the cover button (switches server), clicks on an action button are captured by that button first.
