# Active Context

## Current Focus
Massive structural overhaul complete + features deployed. Dashboard has
Cards/Classic view toggle with server cards showing live CPU/RAM/disk
stats, colored status pills, and quick action buttons. Fork live at
github.com/mlares85/zomboid-control-panel (branch: improvements/structural-overhaul).

## Recent Decisions
- Docker socket must be mounted read-write + `--group-add {docker GID}` or
  run as PUID=0 for container lifecycle to work. The entrypoint's `setpriv`
  drops supplementary groups, so `--group-add` alone doesn't survive.
- Status model: `buildHostSignal` handles docker-local/docker-managed with
  "Container" label. `resolveProvider` infers from dockerContainerId fields.
- Provider badge checks `docker-local`/`docker-managed` strings (not just
  `docker`) since that's what the backend returns.
- Progressive card loading: fetch server list first (instant render), then
  fill stats in background phases.
- `dockerClient` must be `app.set()` in index.js for routes to access it.

## Blockers / Open Questions
- Client build has a few type errors from merge integration (containerStats
  prop on ServerCard not in interface). Deployed build uses --no-cache so
  these are caught at build time but some worktree merges left type drift.
- Dashboard.tsx is 1,556 lines — needs decomposition.
- Backups.tsx is 1,060+ lines — needs decomposition.
- Some frontend tests use jest-dom matchers (`toBeInTheDocument`) that
  TypeScript doesn't recognize — runtime passes but LSP flags them.

## Next Steps
1. Full integration test pass — verify client build is clean (`tsc --noEmit`).
2. Dashboard.tsx decomposition (last oversized page).
3. Prepare focused PRs for upstream (bugs → security → features → structure).
