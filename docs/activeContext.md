# Active Context

## Current Focus
Dashboard decomposed, E2E framework added, upstream ports complete.
Next: decompose Backups.tsx, then validate PZ in managed container.

## Recent Decisions
- Dashboard hook pattern: `useDashboardData` returns a flat bag of
  state + handlers; the shell destructures and passes props to each
  component. Keeps data flow explicit without context overhead.
- E2E uses Playwright (not Cypress) — lighter, better multi-tab/auth
  support, native Vite webServer integration. Auth setup handles both
  first-run and login flows, saving state for reuse across specs.
- Upstream sync: compared fork against origin/main v1.1.42–v1.1.47,
  ported 4 fixes (security, Docker lifecycle, backup race, UX). The
  rest we already had equivalent or better implementations of.

## Blockers / Open Questions
- PZ server hasn't been validated running in the managed container.
  May need lib32gcc-s1, tmpfs for install dir writes.
- ADMIN_PASSWORD env var doesn't propagate — PZ reads admin pwd from
  server INI, needs a first-run config injection step.
- WorldMap.tsx version selector frontend not yet wired (backend ready).

## Next Steps
1. Decompose Backups.tsx (1,060+ lines).
2. Test managed container actually running PZ — fix runtime issues.
3. Wire WorldMap.tsx version selector to /api/map/versions.
