# Active Context

## Current Focus
Onboarding flow overhaul: making the first-install-to-running-server
experience seamless, adding Docker advanced options, and unifying the
setup wizard so every path gets verification and post-setup guidance.

## Recent Decisions
- Docker managed server creation must activate the server and reload
  RCON config — without this, the RCON service keeps stale startup
  credentials and auth fails silently.
- SSH to Unraid uses `~/.ssh/breakingbread_deploy` key with user `root`
  (not `mlares`).
- Upstream fixes cherry-picked selectively: CSP `blob:` for map tiles
  and B42 username disguise warning. Core `build_list.json` fix was
  already in our fork independently.

## Blockers / Open Questions
- Backups for managed servers need Docker-aware implementation (exec or
  volume access) since the panel can't read the container's filesystem.
- Container log streaming not yet implemented (user requested).
- Onboarding wizard "new server" intent breaks out of AddServerFlow
  entirely — needs refactoring to keep all paths inline.

## Next Steps
1. Phase 1 of onboarding overhaul: add Docker advanced options (restart
   policy, Docker memory limit, CPU limit, timezone) to DockerConfigStep
   + backend. Make SetupChecklist dismissible.
2. Phase 2: unify wizard — embed DockerSetup/NativeInstall inside
   AddServerFlow, replace CompleteStep with guided essentials (backups,
   template, credentials, connect info).
3. Container log streaming to dashboard (Docker API → Socket.IO).
