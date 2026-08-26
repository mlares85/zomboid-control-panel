# Active Context

## Current Focus
Windows fresh install UX has been heavily tested and fixed this session.
Next priority is multi-server simultaneous support (running multiple PZ
servers at once with independent dashboards/RCON connections).

## Recent Decisions
- PZ Build 42 dropped ProjectZomboid64.exe — server launches via
  StartServer64.bat + Java. All signature checks updated.
- Admin password was only in startup scripts, not the server DB record —
  lifecycle.js regeneration dropped it. Now persisted via serversApi.create().
- SteamCMD stdout buffering on Windows fixed by splitting on bare \r,
  plus a 5-second folder size poller as a progress fallback.
- Windows auto-start uses Task Scheduler (schtasks CLI) — no NSSM or
  third-party tools. Toggle in Settings > General.
- Steam library folders on other drives discovered via libraryfolders.vdf
  parsing. Multi-install picker shown when >1 found.
- VerifyStep auto-starts native PZ servers before RCON check.
- Startup scripts are platform-specific (.bat-only on Windows).

## Blockers / Open Questions
- Multi-server simultaneous running needs a connection pool (RCON per
  server) and dashboard that shows all servers. Currently single-active.
- Windows Firewall rules (try netsh + fallback) not yet implemented.
- Docker bridge still needs live end-to-end testing on Unraid.

## Next Steps
1. Multi-server simultaneous support — connection pool, independent
   RCON per server, dashboard showing all servers with live status.
2. Windows Firewall rule auto-creation during setup.
3. End-to-end test Docker bridge on Unraid.
