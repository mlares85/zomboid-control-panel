# Active Context

## Current Focus
Docker lifecycle gap analysis complete. Map tile loading fixed (build_list.json
URL migration). Delete flow expanded to three options for managed servers.

## Recent Decisions
- Delete dialog for docker-managed servers now has three independent options:
  (1) Remove from Panel, (2) Delete container & server data, (3) Delete base
  game files. The base files option warns by name about other managed servers
  that would break.
- Map tile proxy: build_list.json moved under a deploy-timestamped static root
  on map.projectzomboid.com. Panel now discovers it by scraping
  `__PZMAP_STATIC_ROOT` from the homepage HTML. Fallback updated to 42.20.0.
- Map version endpoints added: GET /api/map/versions (version list),
  GET /api/map/resolve?version=X (geometry for any version).
- SSH deploy to Unraid: clone → build on server → stop → run.
  Key: ~/.ssh/breakingbread_deploy, host: 192.168.1.85.

## Docker Lifecycle Gaps (from gap analysis)
1. **No rollback on partial creation failure** — orphaned container+DB if
   startContainer() fails after create.
2. **RCON host 127.0.0.1** — breaks container-to-container setups on bridge net.
3. **No restart policy** — crashed containers stay down.
4. **Admin password not injected** into container env.
5. **No orphan container detection** — externally removed containers show "Stopped".
6. **No preflight check** for start-server.sh in base volume.

## Blockers / Open Questions
- PZ server hasn't been validated actually running in the managed
  container yet. May need lib32gcc-s1, tmpfs for install dir writes.
- Dashboard.tsx (1,556 lines) and Backups.tsx (1,060+ lines) still
  need decomposition.
- WorldMap.tsx version selector frontend not yet wired (backend API ready).

## Next Steps
1. Fix Docker lifecycle gaps (rollback, restart policy, RCON host).
2. Test managed container actually running PZ — fix runtime issues.
3. Wire WorldMap.tsx version selector to /api/map/versions.
4. Template frontend: wire CreateTemplateDialog to capture mods.
