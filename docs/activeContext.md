# Active Context

## Current Focus
Onboarding overhaul (Phase 1 + 2) and container log streaming are done.
Next: Docker-managed server backups and pre-existing client test fixes.

## Recent Decisions
- Container log streaming implemented. Backend uses a persistent
  follow=true Docker API connection with incremental frame demuxing.
  ContainerLogStreamer is subscriber-driven (only active when clients
  are in the container:logs room). Frontend shows a collapsible
  terminal-style log viewer on the Dashboard for docker-managed servers.
- Phase 2 complete: unified wizard. All install paths render inline in
  AddServerFlow — every path reaches VerifyStep and CompleteStep.
- ServerSetup.tsx decomposed from 2832 → 215 lines.
- Phase 1 complete: Docker advanced options (restart policy, container
  memory/CPU limits, timezone).

## Blockers / Open Questions
- Backups for managed servers need Docker-aware implementation (exec or
  volume access) since the panel can't read the container's filesystem.
- 6 pre-existing client test failures (MountDiscoveryBanner,
  TemplateApplyPanel) — unrelated to onboarding work.

## Next Steps
1. Backups for managed servers (Docker-aware implementation).
2. Fix pre-existing client test failures.
