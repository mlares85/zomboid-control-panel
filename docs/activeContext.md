# Active Context

## Current Focus
Windows fresh install UX heavily tested and fixed. World map is broken
because the tile host migrated from map.projectzomboid.com to pzmap.org
/ tiles.pzmap.org — needs a full upstream sync of mapProxy.

## Recent Decisions
- Admin password and RCON password now persisted to server DB record so
  lifecycle.js script regeneration doesn't drop them.
- VerifyStep auto-starts native PZ servers before RCON check.
- Windows auto-start uses Task Scheduler (schtasks CLI).
- PZ Build 42 signatures updated (StartServer64.bat, projectzomboid.jar).
- SteamCMD progress: bare \r split + folder size poller fallback.
- Disk space preflight raised to 8 GB for Build 42.

## Blockers / Open Questions
- World map tiles 404: map.projectzomboid.com is dead, tiles at
  tiles.pzmap.org (no /maps prefix), build list at pzmap.org/api/builds.
  Upstream rewrote the entire mapProxy to a single file with curl-based
  metadata fetching (Cloudflare blocks Node fetch for descriptors). Need
  to port upstream's mapProxy.js — too interconnected for a quick URL swap.
  Also add a configurable tile host URL in Settings > World Map.
- Multi-server simultaneous running needs connection pool + dashboard.
- Windows Firewall rules not yet implemented.

## Next Steps
1. Port upstream's mapProxy.js rewrite (pzmap.org migration + Cloudflare
   curl workaround) — world map is completely broken without this.
2. Multi-server simultaneous support — connection pool, per-server RCON.
3. Add configurable map tile host URL in Settings.
