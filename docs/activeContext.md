# Active Context

## Current Focus
All three next-step items completed this session: map version checking with
configurable interval + version selector UI, backup destination selection in
create-backup UI, Docker managed container fixes (32-bit libs, tmpfs, health
check). Upstream dev open to merge requests.

## Recent Decisions
- Map version checker service polls map.projectzomboid.com at a configurable
  interval (1h–7d, default 24h). Socket.IO events notify when a new build
  is detected. WorldMap control rail has a version selector dropdown.
- Backup destination picker appears in the header when multiple destinations
  are configured. Scheduler now sends to all enabled destinations, not just
  local.
- Docker managed containers now install lib32gcc-s1 + libstdc++6:i386 via
  inline entrypoint on first boot. Tmpfs mounted at /tmp. Health check
  endpoint diagnoses common failures (missing libs, OOM, disk full).
- Fork merged into main and pushed to origin. Upstream dev (fpsacha) is open
  to receiving changes as merge/pull requests.

## Blockers / Open Questions
- E2E tests need a clean run (last failure was port conflict, not code)
- Upstream PR strategy: 130+ commits need to be organized into reviewable
  chunks if contributing back to fpsacha/zomboid-control-panel
- Map settings page added but not yet behind auth middleware (follows
  existing pattern — map proxy routes are unauthenticated)

## Next Steps
1. Build NativeSteamCmdInstaller + PZ install auto-detection during setup.
2. Prepare PR(s) for upstream repo if contributing back.
3. E2E test clean run — fix port conflict issue.
4. Wire WorldMap version selector to show "new version available" indicator.
