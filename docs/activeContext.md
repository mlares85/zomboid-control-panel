# Active Context

## Current Focus
All Docker lifecycle gaps closed and deployed. Map tile loading fixed.
Delete flow expanded to three options for managed servers.

## Recent Decisions
- All 11 actionable Docker lifecycle gaps fixed in one commit.
- Managed containers get `RestartPolicy: unless-stopped`.
- RCON host uses Docker container name on bridge network instead of
  127.0.0.1. Panel auto-connects itself to `zomboid-panel-net`.
- Creation has rollback: failed startContainer cleans up container + DB.
- Docker event streaming via `watchEvents()` → Socket.IO `docker:event`.
- ServerManager uses `dockerClient.restartContainer()` for Docker-backed
  servers instead of the multi-step stop → wait → start sequence.
- Delete dialog: three independent options for managed servers (remove
  from panel, delete container & data, delete base game files).
- Map: build_list.json now discovered via `__PZMAP_STATIC_ROOT` scrape.
  Fallback updated to 42.20.0. Version endpoints ready for frontend.
- SSH deploy to Unraid: clone → build on server → stop → run.
  Key: ~/.ssh/breakingbread_deploy, host: 192.168.1.85.

## Blockers / Open Questions
- PZ server hasn't been validated actually running in the managed
  container yet. May need lib32gcc-s1, tmpfs for install dir writes.
- Dashboard.tsx (1,556 lines) and Backups.tsx (1,060+ lines) still
  need decomposition.
- WorldMap.tsx version selector frontend not yet wired (backend API ready).
- Admin password env var (ADMIN_PASSWORD) is set on the container but PZ
  reads it from server INI — needs a first-run config injection step.

## Next Steps
1. Test managed container actually running PZ — fix runtime issues.
2. Wire WorldMap.tsx version selector to /api/map/versions.
3. Template frontend: wire CreateTemplateDialog to capture mods.
