# Active Context

## Current Focus
Docker-managed servers deployed end-to-end on Unraid. Container creates
but PZ hasn't been validated running yet — the `eclipse-temurin:21-jre`
image may need additional Linux packages, and the read-only base mount
may cause issues with PZ writing temp/log files to its install dir.

## Recent Decisions
- Container-internal paths (e.g. /pz-server) are auto-resolved to host
  paths via Docker API inspection of the panel's own mounts. System-
  agnostic — works on any Docker deployment, not just Unraid.
- "Remove From Panel" for docker-managed servers also stops and removes
  the container. Non-managed servers just remove the DB record.
- Docker lifecycle (start/stop/restart) is separate from the Remove
  button — managed via the existing dashboard card actions.
- Custom container image configurable in Advanced Options with glibc
  warning (Alpine won't work).
- SSH deploy to Unraid: clone → build on server → stop → run.
  Key: ~/.ssh/breakingbread_deploy, host: 192.168.1.85.

## Blockers / Open Questions
- PZ server hasn't been validated actually running in the managed
  container yet. May need lib32gcc-s1, tmpfs for install dir writes.
- Dashboard.tsx (1,556 lines) and Backups.tsx (1,060+ lines) still
  need decomposition.
- Template frontend integration pending (capture mods, preview).
- Docker setup wizard could benefit from better error messaging when
  the container fails to start (show container logs in the UI).

## Next Steps
1. Test managed container actually running PZ — fix runtime issues.
2. Show container logs in panel when a managed server fails to start.
3. Template frontend: wire CreateTemplateDialog to capture mods.
