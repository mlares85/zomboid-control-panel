# Active Context

## Current Focus
Massive Windows fresh install UX session — fixed ~15 issues from build
failures to map tiles. All deployed to Unraid. Next priority is
multi-server simultaneous support.

## Recent Decisions
- World map proxy ported from upstream — single consolidated mapProxy.js
  replacing the old 11-file directory. Uses curl for metadata (Cloudflare
  blocks Node's TLS), plain fetch for tile bytes. MapVersionChecker
  service removed (version detection now internal to proxy).
- Admin password and RCON password must be persisted to the server DB
  record, not just the startup script — lifecycle.js regenerates scripts
  on every /start and reads from the DB record.
- VerifyStep auto-starts native PZ servers before RCON check — was the
  biggest UX gap (users stuck waiting for RCON on a server that wasn't
  running).
- Windows auto-start uses Task Scheduler (schtasks CLI) — toggle in
  Settings > General, only shown on Windows.
- PZ Build 42 has no .exe launcher — uses StartServer64.bat + Java.
  All signature checks updated across detectInstall and verifyInstall.

## Blockers / Open Questions
- Multi-server simultaneous running needs a connection pool (RCON per
  server) and dashboard showing all servers with live status.
- Auto-update checker points at upstream repo (fpsacha), not this fork.
  Needs to either point at mlares85 or be disabled.
- Windows Firewall rules (try netsh + fallback) not yet implemented.
- Docker bridge still needs live end-to-end testing on Unraid.

## Next Steps
1. Multi-server simultaneous support — connection pool, per-server RCON,
   dashboard showing all servers with independent start/stop.
2. Point auto-updater at this fork or disable it.
3. Windows Firewall rule auto-creation during setup.
