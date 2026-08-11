# Active Context

## Current Focus
Docker lifecycle hardened and deployed. Map tile loading fixed.
Next: validate PZ actually runs inside a managed container on Unraid.

## Recent Decisions
- RCON host uses Docker container name (not 127.0.0.1) because the panel
  auto-connects itself to `zomboid-panel-net` — required for container-to-
  container DNS resolution.
- Managed containers get `RestartPolicy: unless-stopped` so they survive
  daemon restarts and auto-recover from crashes.
- Docker restart for managed servers uses a single `restartContainer()`
  call instead of the multi-step RCON quit → stop → wait → start flow
  (the RCON warning/save sequence still runs before the restart kicks in).
- Map build_list.json moved under a deploy-timestamped static root on
  map.projectzomboid.com. Panel discovers it by scraping
  `__PZMAP_STATIC_ROOT` from the homepage HTML (24h cache).
- Delete dialog for docker-managed servers: three independent options
  (remove from panel / delete container+data / delete base game files).
  Base files option warns by name about other affected servers.
- SSH deploy to Unraid: clone → build on server → stop → run.
  Key: ~/.ssh/breakingbread_deploy, host: 192.168.1.85.

## Blockers / Open Questions
- PZ server hasn't been validated running in the managed container.
  May need lib32gcc-s1, tmpfs for install dir writes.
- ADMIN_PASSWORD env var is set but PZ reads admin pwd from server INI —
  needs a first-run config injection step to actually take effect.
- WorldMap.tsx version selector frontend not yet wired (backend ready).

## Next Steps
1. Test managed container actually running PZ — fix runtime issues.
2. Wire WorldMap.tsx version selector to /api/map/versions.
3. Decompose Dashboard.tsx (1,556 lines) and Backups.tsx (1,060+ lines).
