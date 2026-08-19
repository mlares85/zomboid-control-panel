# Fork Changes

Complete list of improvements in this fork ([mlares85](https://github.com/mlares85/zomboid-control-panel)) vs upstream ([fpsacha](https://github.com/fpsacha/zomboid-control-panel)). **132 commits, 42 features, 23 refactors, 21 fixes.**

---

## Architecture Overhaul

### Backend Route Decomposition
Every monolith route file in the upstream was decomposed into focused modules:

| Original file | Lines | Modules |
|---|---|---|
| `routes/mods.js` | 7,901 | → 62 modules in `routes/mods/` |
| `routes/server.js` | 4,098 | → 26 modules in `routes/server/` |
| `routes/debug.js` | 4,639 | → 46 modules in `routes/debug/` |
| `routes/serverFiles.js` + `routes/chunks.js` | 4,165 | → 34 modules in `routes/serverFiles/` + `routes/chunks/` |
| `routes/panelBridge.js` | 3,688 | → focused sub-modules |
| `routes/auth.js` | — | → `routes/auth/` (session, recovery, passwordReset) |
| `routes/players.js` | — | → `routes/players/` |
| `routes/servers.js` | — | → `routes/servers/` |
| `routes/config.js` | — | → `routes/config/` |
| `routes/serverFinder.js` | — | → `routes/serverFinder/` |
| `routes/mapProxy.js` | — | → `routes/mapProxy/` |
| `routes/discord.js` | — | → `routes/discord/` |
| `routes/scheduler.js` | — | → `routes/scheduler/` |

### Frontend Decomposition

| Original file | Lines | Result |
|---|---|---|
| `Settings.tsx` | 6,822 | → 146-line shell + 33 components + 14 hooks |
| `ServerConfig.tsx` | 3,879 | → 165-line shell + 30 components + 10 hooks |
| `Dashboard.tsx` | 1,556 | → 131-line shell + 12 components + `useDashboardData` hook |
| `Backups.tsx` | 1,077 | → 160-line shell + 7 components + `useBackupsData` hook |

### Shared Middleware
Extracted reusable guard middleware replacing 95+ copy-pasted inline checks: `requireRcon`, `requireBridge`, `requireActiveServer`, `requireModChecker`, `panelBridgeGuards`.

### Server Provider Abstraction (FileAccess)
Modular `FileAccess` interface replaces 200+ direct `fs` calls across 59 files:
- `LocalFiles` — wraps `fs/promises` for local/Docker servers
- `SftpMirrorFiles` — session-aware SFTP mirror with pull/edit/push and concurrency lock
- `remoteMirrorMiddleware` rewritten — sets `req.fileAccess` transparently for all route handlers
- 26 contract tests + 8 SFTP mirror tests

### Error Handling
- All errors use `{success: boolean, error?: string}` result objects (no thrown errors)
- Custom ESLint rule `require-result-handling` enforces checking `{success: false}` results
- Config-dependent errors include a `fixUrl` field → frontend renders "Fix this →" links
- `errorToastContent()` composes toast + action in one call

---

## Features

### Built-in Help & Wiki
- `/wiki` route with 26 searchable articles across 8 categories
- Client-side full-text search (title/tag/body scoring, no external dependencies)
- Structured `ArticleBlock[]` content format — typed, cross-linked, testable
- Link integrity test catches broken article references at CI time
- Categories: Getting Started, Docker, Mods, Templates, Backups, Scheduler, Discord, Advanced

### Contextual Field Help (FieldHelp)
- Every configurable field across every page has a contextual tooltip
- Description + context + recommendation badge (safe-default / must-configure / advanced) + wiki link
- ~100+ fields covered across Settings, Backups, Servers, ServerSetup, Discord, Scheduler, Templates, Console, Players, Chat, Events, Mods, ChunkCleaner
- Server Config: ~60 INI + sandbox settings auto-wired via lookup maps in `serverConfigHelp/`

### Simulation Template System
- Portable JSON templates: sparse SandboxVars + INI overrides (only non-default keys)
- 6 built-in templates + user-created templates persisted in database
- `iniExclusions` prevents identity/secret keys from traveling in templates
- Diff-preview against live server config before applying
- Mandatory backup before apply
- Mod capture/apply for template import/export
- Frontend: card grid, diff preview panel, import/export dialogs

### Docker Managed Servers
- Create and manage PZ server containers from the panel UI
- Shared `zomboid-panel-base` volume (~3 GB, downloaded once via SteamCMD container)
- Per-server data volumes (`zomboid-srv-{name}`)
- Auto port assignment (game UDP + RCON TCP)
- Internal `zomboid-panel-net` bridge network for RCON
- Container lifecycle events via Socket.IO (`docker:event`)
- Resource monitoring: CPU, memory, disk I/O, network (polled every 5s)
- Rollback on failed creation
- Three-option delete: remove from panel / delete container / delete base files
- `RestartPolicy: unless-stopped` for crash recovery
- PanelBridge auto-install on managed server creation

### Docker Socket Integration
- Detect Docker socket at startup
- Container listing, lifecycle control (start/stop/restart)
- Container stats and log streaming
- Docker runtime detection: OrbStack → Docker Desktop → Colima → native

### Per-Server RCON Status
- `GET /api/servers/rcon-status` probes all configured servers (3s timeout, max 3 concurrent)
- Dashboard `ServerCard` shows RCON signal alongside host process signal

### Mount Auto-Discovery
- Scans common Docker mount paths + env-configured paths for PZ server signatures
- `MountDiscoveryBanner` with dismiss memory (localStorage)
- `DiscoverySetup` dialog: re-probes mount → prefills RCON config → test connection → create server
- First-run: auto-opens discovery if no servers configured

### Platform-Specific Onboarding
- `platformGuidance`: `canRunNative`, `canRunDocker`, `dockerRuntime`, install recommendations
- macOS: `MacDockerGuide` screen (OrbStack/Docker Desktop links + remote-server escape hatch)
- Windows: firewall port reminder
- Unified first-run onboarding wizard (`AddServerFlow`, 5 steps)

### Backup Enhancements
- Multiple archive formats: `.zip`, `.tar.gz`, `.tar.zst`
- Server config snapshots embedded in every backup record
- Backup history table with server filter
- Upload existing backups
- Delete older than N days

### Disk Monitoring
- `diskMonitor.js` polls free space every 60 seconds
- Warning at 90%, critical at 95%
- Combined with circuit-breaker status in `/api/system/storage-health`
- Persistent frontend banner for critical disk states

### Dashboard Enhancements
- Cards/Classic view toggle
- Compact server cards overview (one card per configured server)
- 3-signal composed status: host process / RCON / PanelBridge
- Provider-aware status labels ("Process" vs "Container" vs "Host")

### No-Dead-End Error Messages
- Every error message includes an actionable suggestion
- `fixUrl` field points to the relevant Settings page
- Frontend renders "Fix this →" links in error toasts

---

## Security Fixes
- Masked leaked secrets in error responses
- Closed path traversal vulnerability in file routes
- Fixed auth gaps in several endpoints
- Timing-safe dummy-hash comparison on "user not found" (prevents username enumeration)
- SHA-256 hashed recovery codes
- `tokenGen` counter invalidates all tokens on password change

---

## Testing

### E2E Test Suite (new)
- **UI smoke tests**: 89 Playwright tests across all 16 pages
- **Docker integration tests**: 5 workflow specs (server lifecycle, RCON console, backup create/restore, template save/export, settings persistence)
- Auth fixture with login fallback for stale JWT
- Rate limiters relaxed in `NODE_ENV=test`
- `nodemon.json` restricts watch to `server/` (prevents restart loops)

### Unit Tests
- 731 server tests (Vitest) — up from upstream baseline
- 107 client tests (Vitest) — up from upstream baseline
- 26 FileAccess contract tests
- 12 wiki registry + search tests

---

## Upstream Sync
- Compared fork against `origin/main` v1.1.42–v1.1.47
- Ported 4 fixes: security patch, Docker lifecycle gap, backup race condition, UX improvement
- Verified remaining upstream changes — fork already had equivalent or better implementations
