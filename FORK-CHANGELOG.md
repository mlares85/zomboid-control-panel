# Fork Changelog — Structural Overhaul Branch

**Fork**: [mlares85/zomboid-control-panel](https://github.com/mlares85/zomboid-control-panel/tree/improvements/structural-overhaul)
**Upstream**: [fpsacha/zomboid-control-panel](https://github.com/fpsacha/zomboid-control-panel) v1.1.41
**Branch**: `improvements/structural-overhaul`

This fork adds features, fixes bugs, patches security issues, and restructures the codebase for maintainability. Everything is backward-compatible with the upstream data format. All upstream releases through v1.1.41 are merged.

---

## 🐛 Bug Fixes

### Docker Topology
- **Env-var fallback** — `PZ_SERVER_PATH` and `PZ_SAVE_PATH` are no longer silently ignored when a server profile exists in `db.json`. Env vars seed empty fields at creation and serve as fallback at read time.
- **Provider abstraction** — servers now carry a `provider` field (`native`, `docker-local`, `docker-managed`, `remote-sftp`) replacing the ambiguous `isRemote` boolean. Docker-to-Docker setups no longer default to "remote" and trigger SFTP requirements.
- **Provider guard** — `serverManager.start()` refuses to spawn a native PZ process when the server runs in Docker, preventing the "RCON port already in use" error from a duplicate process.

### RCON
- **Test connection button** — distinct "unreachable" (wrong host/port) vs "auth failed" (wrong password) errors instead of silent failure.
- **Password show/hide toggles** — on all RCON and SFTP password fields.

### Monitoring
- **Disk space monitoring** — polls save volume every 60s with 90%/95% thresholds. Full disk during save = world corruption.
- **Circuit breaker UI** — surfaces degraded storage state (db.json write failures) as a persistent banner instead of silently dropping writes.

---

## 🔒 Security Fixes

- **JWT secret leak** — `GET /api/config/app-settings` returned the JWT signing key in plaintext. Replaced hand-maintained `SENSITIVE_KEYS` allowlist with pattern-based regex masking.
- **Path traversal** — `serverName` field on `PUT /api/servers/:id` accepted `../../` without validation. Added `path.basename()` check + regex validation.
- **RCON/admin password leak** — multi-server CRUD endpoints returned passwords in plaintext. Added `sanitizeServerResponse()` to all server record responses.
- **Discord bot token leak** — same endpoint that leaked JWT also returned `discordBotToken`. Fixed by pattern-based masking.
- **CORS authorization** — `corsAllowAll` was writable by any authenticated user. Now gated behind `requireRole("admin")`.
- **Directory browsing** — `GET /api/chunks/browse` had no root confinement. Confined to active server's `zomboidDataPath`.
- **Browser extension** — dropped wildcard `http://*/*` host permissions; kept only Steam domains.
- **Local reset bypass** — Docker bridge IPs (172.16.0.0/12) excluded from "local" address check.
- **PanelBridge auth** — added `requireRole("admin")` to mod install routes.

---

## ✨ New Features

### Server Templates
- 6 built-in presets: Vanilla Apocalypse, First Week Friendly, Hardcore Survivor, PvP Raiding, Builder's Paradise, Six Months Later
- Sparse format — only keys that differ from PZ defaults, forward-compatible across builds
- Diff preview against live server config before applying
- Apply with mandatory pre-apply backup
- Import/export as `.pztemplate.json` for sharing
- Full Templates page with card grid, tags, difficulty labels

### Docker Integration
- **Mount discovery** — auto-detects PZ files at common Docker mount paths and env-configured paths
- **One-click server setup** — discovery banner + setup dialog auto-opens on first run when mounts found
- **PanelBridge auto-install** — copies Lua mod on server activation when filesystem is shared
- **Docker socket support** — raw HTTP over Unix socket (no dependencies), container start/stop/restart/logs
- **3-signal server status** — `Container: Running · RCON: Disconnected · Bridge: Offline` replaces confusing "Active"/"Stopped" labels
- **Docker container status component** — badge + lifecycle buttons + expandable logs on Servers page

### Safe Mod Update
- One-click: backup → update → warn players (configurable delay) → restart → verify boot
- Socket.IO progress events per step
- Concurrency guard prevents overlapping updates

### Backup System
- **Compression formats** — zip (existing), tar.gz, tar.zst with size/speed comparison endpoint
- **Cloud destinations** — Google Drive (OAuth2), SFTP, with SMB/FTP/rsync stubs
- **Incremental backups** — manifest-based file tracking, full-every-N policy
- **Save compaction** — stale chunk detection with preview and backup-before-delete
- **Backup verification** — archive integrity check + SHA-256 checksums
- **Format comparison UI** — visual comparison of compression ratios

### Onboarding Wizard
- Unified 5-step first-run flow: Account → Environment → Server Type → Configure → Verify → Complete
- Platform-aware: detects Windows/macOS/Linux/Docker, shows appropriate options
- macOS: Docker install guide (OrbStack/Docker Desktop) when no Docker found
- Windows: SteamCMD guidance + firewall port reminder
- Verify step with live probes (RCON reachable vs auth-failed, PanelBridge heartbeat)
- Setup checklist card persists on Dashboard until all items complete
- Replaces three separate add-server code paths with one unified flow

### Error UX
- ~20 error sites improved with cause descriptions and `fixUrl` fields
- Frontend `<FixThisAction>` component renders "Fix this →" links in toast notifications
- No more dead-end errors — every failure names the cause and links to the fix

---

## 🏗️ Codebase Overhaul

### Backend Decomposition
All 14 oversized route files split into focused modules:

| File | Before | After |
|------|--------|-------|
| `routes/mods.js` | 7,901 lines | 62 modules |
| `routes/debug.js` | 4,639 lines | 46 modules |
| `routes/server.js` | 4,098 lines | 26 modules |
| `routes/panelBridge.js` | 3,688 lines | 15 modules |
| `routes/serverFiles.js` | 2,091 lines | 15 modules |
| `routes/chunks.js` | 2,074 lines | 19 modules |
| `routes/players.js` | 858 lines | 11 modules |
| `routes/servers.js` | 832 lines | 7 modules |
| `routes/config.js` | 675 lines | 8 modules |
| `routes/auth.js` | 659 lines | 6 modules |
| `routes/serverFinder.js` | 619 lines | 8 modules |
| `routes/mapProxy.js` | 587 lines | split |
| `routes/discord.js` | 468 lines | 6 modules |
| `routes/scheduler.js` | 382 lines | 8 modules |

### Frontend Decomposition
All 13 oversized pages split into focused components + hooks:

| Page | Before | After |
|------|--------|-------|
| `Settings.tsx` | 6,822 lines | 146 lines + 34 components + 14 hooks |
| `Debug.tsx` | 5,719 lines | 129 lines + 20 components + 10 hooks |
| `Mods.tsx` | 5,515 lines | 572 lines + 15 hooks + 27 components |
| `ServerConfig.tsx` | 3,879 lines | 167 lines + 30 components + 10 hooks |
| `WorldMap.tsx` | 3,730 lines | 185 lines + 18 components + 7 hooks |
| `ChunkCleaner.tsx` | 3,030 lines | 147 lines + 10 components + 8 hooks |
| `Events.tsx` | 2,926 lines | 99 lines + 34 components + 8 hooks |
| `Players.tsx` | 2,821 lines | 177 lines + 26 components + 14 hooks |
| `ServerSetup.tsx` | 2,590 lines | 104 lines + 15 components + 8 hooks |
| `Servers.tsx` | 2,225 lines | 149 lines + 16 components + 9 hooks |
| `Discord.tsx` | 2,106 lines | 58 lines + 19 components + 7 hooks |
| `Console.tsx` | 1,192 lines | 90 lines + 13 components + 4 hooks |

### Shared Middleware
Extracted from ~95+ copy-pasted guard checks:
- `requireRcon` — RCON connected check
- `requireBridge` — PanelBridge ready check
- `requireActiveServer` — active server exists check
- `requireModChecker` — mod checker initialized check
- `panelBridgeGuards` — bridge configured/running checks

### Testing
- **~200 new tests** (500+ total, up from ~220)
- Custom ESLint rule `require-result-handling` preserved and respected

### Infrastructure
- **CLAUDE.md** — coding rules for Claude Code sessions (TDD, 300-line file cap, 15-line function cap)
- **ARCHITECTURE.md** — project-wide patterns and decisions
- **.claude/commands/initme.md** — `/initme` for session orientation
- **.claude/commands/mup.md** — `/mup` for end-of-session context preservation
- **docs/activeContext.md** — current focus, decisions, blockers, next steps
