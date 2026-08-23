# Active Context

## Current Focus
Onboarding flow overhaul: making the first-install-to-running-server
experience seamless, adding Docker advanced options, and unifying the
setup wizard so every path gets verification and post-setup guidance.

## Recent Decisions
- Phase 1 complete: Docker advanced options (restart policy, container
  memory/CPU limits, timezone) added to DockerConfigStep + backend.
  SetupChecklist made always dismissible.
- Validation and host-path resolution extracted from managed.js to
  managedValidation.js to keep managed.js under the 300-line limit.
- Docker managed server creation must activate the server and reload
  RCON config — without this, the RCON service keeps stale startup
  credentials and auth fails silently.

## Blockers / Open Questions
- Backups for managed servers need Docker-aware implementation (exec or
  volume access) since the panel can't read the container's filesystem.
- Container log streaming not yet implemented (user requested).
- Onboarding wizard "new server" intent breaks out of AddServerFlow
  entirely — needs refactoring to keep all paths inline.

## Next Steps
1. Phase 2: unify wizard — embed DockerSetup/NativeInstall inside
   AddServerFlow, replace CompleteStep with guided essentials (backups,
   template, credentials, connect info).
2. Container log streaming to dashboard (Docker API → Socket.IO).
3. Backups for managed servers (Docker-aware implementation).
