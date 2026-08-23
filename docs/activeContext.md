# Active Context

## Current Focus
Onboarding overhaul complete (Phase 1 + 2). Next: container log streaming
and Docker-managed server backups.

## Recent Decisions
- Phase 2 complete: unified wizard. All install paths (Fresh Install,
  Quick Setup, Docker) now render inline in AddServerFlow — no more
  breakout navigation to /server-setup. Every path reaches VerifyStep
  (RCON/bridge checks) and CompleteStep (template/mods/backup guidance).
- ServerSetup.tsx decomposed from 2832 → 215 lines. Install flows
  extracted into FullInstallFlow (14 files) and QuickSetupFlow (11 files).
- Phase 1 complete: Docker advanced options (restart policy, container
  memory/CPU limits, timezone) added to DockerConfigStep + backend.
  SetupChecklist made always dismissible.
- Docker managed server creation must activate the server and reload
  RCON config — without this, the RCON service keeps stale startup
  credentials and auth fails silently.

## Blockers / Open Questions
- Backups for managed servers need Docker-aware implementation (exec or
  volume access) since the panel can't read the container's filesystem.
- Container log streaming not yet implemented (user requested).
- 6 pre-existing client test failures (MountDiscoveryBanner,
  TemplateApplyPanel) — unrelated to onboarding work.

## Next Steps
1. Container log streaming to dashboard (Docker API → Socket.IO).
2. Backups for managed servers (Docker-aware implementation).
3. Fix pre-existing client test failures.
