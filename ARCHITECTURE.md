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

## Deferred decisions

### Docker socket integration
Mount `/var/run/docker.sock` into the panel container (optional). Detect at startup, expose as capability flag. Use `dockerode` for container listing, creation, lifecycle. Restrict operations to containers with `zomboid-panel.managed=true` label. Support `DOCKER_HOST` env var for socket-proxy setups.

### Multi-server connection pool
The scheduler already proves concurrent RCON connections work (temporary instances for background tasks). Promote to a pool keyed by server ID. Dashboard shows all servers with live status.

### Community template registry
Git repo of templates fetched as a static index. PRs as moderation. Import from URL/gist. Out of scope until the template UI ships.
