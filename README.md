<div align="center">

# 🧟 Zomboid Control Panel — Enhanced Fork

### The complete admin cockpit for Project Zomboid dedicated servers

[![Upstream](https://img.shields.io/badge/upstream-fpsacha%2Fzomboid--control--panel-8a9a5b?style=for-the-badge&logo=github)](https://github.com/fpsacha/zomboid-control-panel)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)](LICENSE)

Manage your Project Zomboid dedicated server from one place: server controls, RCON, a live world map, Workshop mods, scheduled restarts, backups, Discord integration, **built-in help wiki**, and a **modular server provider architecture** supporting native, Docker, and remote setups.

[**📖 Setup**](#quick-start) ·
[**🆕 Fork Features**](#fork-enhancements) ·
[**📋 Full Changelog**](FORK_CHANGES.md) ·
[**🔧 Development**](#development)

</div>

---

## Fork Enhancements

This fork extends the [upstream panel](https://github.com/fpsacha/zomboid-control-panel) with architectural improvements and new features:

### 📚 Built-in Help & Wiki
Every page has contextual help. Every field and option has a tooltip explaining what it does, why it matters, and whether beginners need to change it — with links to deeper wiki articles. 26 searchable articles covering setup, Docker, mods, templates, backups, scheduling, Discord, and advanced topics. No external docs site needed.

### 🔌 Server Provider Abstraction
Modular `FileAccess` interface replaces 200+ scattered `fs` calls with a clean abstraction. Two implementations ship today:
- **`LocalFiles`** — direct filesystem access for native, docker-local, and docker-managed servers
- **`SftpMirrorFiles`** — session-aware SFTP mirror with pull/edit/push semantics and a concurrency lock for remote servers

This is the foundation for platform-specific server providers (native SteamCMD on Windows/Linux, Docker via OrbStack on macOS).

### 🐳 Docker Managed Servers
Create and fully manage PZ server containers from the panel UI. Shared base volume (~3 GB of game files downloaded once), per-server data volumes, auto port assignment, internal Docker network for RCON, container lifecycle events via Socket.IO, and resource monitoring (CPU, memory, disk, network).

### 🧪 Comprehensive E2E Testing
Two-tier Playwright test suite:
- **UI smoke tests** (`npm run test:e2e`) — 89 tests across all 16 pages, no Docker needed
- **Integration tests** (`npm run test:e2e:integration`) — full workflow tests with a live PZ server in Docker (server lifecycle, RCON console, backup create/restore, template save/export, settings persistence)

Plus 830+ unit tests (723 server + 107 client).

### 🏗️ Structural Improvements
- Dashboard decomposed from 1,556 → 131-line shell + 12 components
- Backups decomposed from 1,077 → 160-line shell + 7 components
- Per-server RCON status probing across all configured servers
- Container resource stats polling (CPU/memory/disk/network)
- Backup server snapshots with curated config data
- Mount auto-discovery with guided server creation
- Platform-specific onboarding (macOS Docker guidance, Windows firewall hints)

---

## What It Does

### Operate
- **Server control** — Start, stop, restart, save. Live status and uptime.
- **Console** — Live log viewer and RCON terminal with command history.
- **Scheduling** — Recurring restarts, saves, broadcasts with countdown warnings.
- **Backups** — Create, restore, and manage world backups with multiple format support.

### Observe
- **Players** — Online list, activity history, kick/ban/unban, access levels, notes and tags.
- **World map** — Live player positions on Knox County with right-click actions.
- **Mod manager** — Track Workshop mods, detect updates, import Steam collections, auto-sort load order, scan for conflicts.
- **Server config** — Full INI editor with structured and raw views. Sandbox, spawn points, mod settings — searchable and editable in-browser. Every field has contextual help tooltips.

### Extend
- **Events & weather** — Rain, storms, blizzards, climate control, time control, sound triggers, zombie management.
- **PanelBridge** — Server-side Lua mod for actions RCON can't reach: teleport, heal, god mode, character export/import, inventory.
- **Discord bot** — Slash commands and two-way chat relay.
- **Multi-server** — Manage multiple PZ servers from one panel.
- **Chunk cleaner** — Visual map selector for cleaning unused chunks.
- **Built-in wiki** — 26 searchable help articles with contextual field tooltips across every page.

---

## Requirements

- **Project Zomboid dedicated server** — Build 41 or Build 42. Tested through B42.18.
- **RCON enabled** in your server `.ini` (`RCONPort=27015` and `RCONPassword=...`).
- **Network access** between the panel and the PZ server (same machine, same LAN, or reachable IP).
- For PanelBridge features: `DoLuaChecksum=false` in the server `.ini`.

The packaged binary includes its own runtime — no Node.js, Python, or Java install needed on the panel host.

---

## Quick Start

### Windows
1. Extract `ZomboidControlPanel-windows.zip`
2. Run `Start.bat`
3. Open `http://localhost:3001`

### Linux
```bash
tar xzf ZomboidControlPanel-linux.tar.gz
./start.sh
```
Works on Ubuntu 20.04+, Debian 10+, CentOS Stream 8+, Rocky 8+, or anything with glibc 2.28+.

### Docker

```bash
docker compose -f docker-compose.install.yml up -d
```

Open `http://localhost:3001`. For full setup with bind mounts, see the documented [`docker-compose.yml`](docker-compose.yml).

#### Docker-managed servers

If the panel has Docker socket access (`-v /var/run/docker.sock:/var/run/docker.sock`), use **Add Server → Docker Server** to let the panel create and fully manage PZ server containers. The panel handles volumes, networking, port assignment, and lifecycle — no manual `docker run` needed.

---

## Setup

1. Open the panel and create your admin account.
2. In **Settings**, set your server install path and Zomboid data path.
3. Configure RCON (host, port `27015`, password from your server `.ini`).
4. Optionally install PanelBridge for advanced features.
5. Check the **Help & Wiki** page for step-by-step guides.

### PanelBridge (Optional)

PanelBridge is a server-side Lua drop-in that enables features RCON can't reach — teleport, heal, weather control, character export/import, inventory editing, sound triggers. No client-side installation required.

---

## Security

- JWT authentication on all API routes.
- Rate limiting on login, RCON, and destructive operations.
- RCON parameter sanitization to prevent command injection.
- CORS configurable per deployment (LAN auto-allows private IPs, VPS requires explicit origins).
- Password reset via secure token file or `--reset-password` CLI flag.

---

## Development

```bash
npm run install:all
npm run dev
```
Frontend at `http://localhost:5173`, backend at `http://localhost:3001`.

### Testing

```bash
npm run test:server           # 723 server unit tests (Vitest)
npm run test:client           # 107 client unit tests (Vitest)
npm run test:e2e              # 89 E2E smoke tests — all 16 pages (Playwright)
npm run test:e2e:integration  # Full workflow tests with live PZ server in Docker
npm run lint:server           # ESLint with require-result-handling rule
npm run build                 # Verify frontend builds
```

### Building

```bash
node build.js --all           # Build Windows + Linux binaries
```

---

## License

MIT — based on [fpsacha/zomboid-control-panel](https://github.com/fpsacha/zomboid-control-panel)
