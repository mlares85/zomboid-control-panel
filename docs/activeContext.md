# Active Context

## Current Focus
FileAccess migration COMPLETE (59 files). Wiki/help system live with 26
articles. FieldHelp tooltips on every field across Settings, Backups, Servers,
Discord, Scheduler, Templates. E2E suite covers all pages.

## Recent Decisions
- Backups decomposition follows Dashboard pattern: `useBackupsData` hook
  returns flat bag of state + handlers; shell (160 lines) keeps dialog
  state and layout. 7 extracted components in `components/backups/`.
  `describeSchedule` moved to `formatUtils.ts` alongside formatBytes/formatDate.
- Dashboard hook pattern: `useDashboardData` returns a flat bag of
  state + handlers; the shell destructures and passes props to each
  component. Keeps data flow explicit without context overhead.
- E2E uses Playwright (not Cypress) — lighter, better multi-tab/auth
  support, native Vite webServer integration. Auth setup handles both
  first-run and login flows, saving state for reuse across specs.

## Blockers / Open Questions
- PZ server hasn't been validated running in the managed container.
  May need lib32gcc-s1, tmpfs for install dir writes.
- ADMIN_PASSWORD env var doesn't propagate — PZ reads admin pwd from
  server INI, needs a first-run config injection step.
- WorldMap.tsx version selector frontend not yet wired (backend ready).

## Next Steps
1. Build SftpMirrorFiles (FileAccess implementation for remote servers).
2. Build NativeSteamCmdInstaller for Windows/Linux local server installs.
3. Add FieldHelp to remaining pages (Console, Players, Chat, Events, Mods, ServerConfig).
4. Test managed container actually running PZ — fix runtime issues.
5. Wire WorldMap.tsx version selector to /api/map/versions.
