# Active Context

## Current Focus
Dashboard decomposed, E2E testing framework added. Upstream ports
complete. Next: decompose Backups.tsx, then validate PZ in managed
container on Unraid.

## Recent Decisions
- Dashboard.tsx decomposed: 1,556 → 131-line shell + 12 components +
  1 hook. Components in `components/dashboard/`, hook in
  `hooks/dashboard/useDashboardData.ts`.
- E2E framework: Playwright with chromium, auth setup (handles first-run
  + login), 3 spec files (smoke, dashboard controls, navigation).
  Run `npx playwright install chromium` before first use.
- Ported 4 upstream fixes (v1.1.42–v1.1.47): logout jwt.verify, Docker
  lifecycle routing, backup records mutation queue, SFTP bridge link.
- RCON host uses Docker container name (not 127.0.0.1) because the panel
  auto-connects itself to `zomboid-panel-net`.
- SSH deploy to Unraid: clone → build on server → stop → run.
  Key: ~/.ssh/breakingbread_deploy, host: 192.168.1.85.

## Blockers / Open Questions
- PZ server hasn't been validated running in the managed container.
  May need lib32gcc-s1, tmpfs for install dir writes.
- ADMIN_PASSWORD env var is set but PZ reads admin pwd from server INI —
  needs a first-run config injection step to actually take effect.
- WorldMap.tsx version selector frontend not yet wired (backend ready).

## Next Steps
1. Decompose Backups.tsx (1,060+ lines).
2. Test managed container actually running PZ — fix runtime issues.
3. Wire WorldMap.tsx version selector to /api/map/versions.
4. Expand E2E test coverage (server lifecycle, settings, backups).
