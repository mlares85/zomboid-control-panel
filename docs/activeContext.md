# Active Context

## Current Focus
Upstream ports complete (v1.1.42–v1.1.47). Fork is now caught up with
origin/main. Next: validate PZ actually runs inside a managed container
on Unraid, then continue frontend decomposition.

## Recent Decisions
- Ported 4 upstream fixes: logout jwt.verify (issue #43), Docker
  lifecycle routing (stop/restart through serverManager for containers),
  backup records mutation queue, SFTP bridge link on server cards.
- Docker stop/restart: all call sites (web `/stop`, Discord `/stop`,
  scheduler auto-restart) now route through `serverManager.stopServer()`
  or `dockerClient.restartContainer()` for Docker-backed servers instead
  of `rconService.quit()` (which killed PID 1 and triggered restart
  policy).
- `dockerClient._lifecycleAction` reads the container's `StopTimeout`
  for a per-action HTTP timeout instead of the flat 8s default.
- `docker/entrypoint.sh` preserves supplementary groups (docker GID)
  instead of `--clear-groups` unconditionally.
- `backupRecords.js` mutations serialized through a promise-chain queue
  to prevent concurrent read-modify-write races.
- RCON host uses Docker container name (not 127.0.0.1) because the panel
  auto-connects itself to `zomboid-panel-net` — required for container-to-
  container DNS resolution.
- Map build_list.json moved under a deploy-timestamped static root on
  map.projectzomboid.com. Panel discovers it by scraping
  `__PZMAP_STATIC_ROOT` from the homepage HTML (24h cache).
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
