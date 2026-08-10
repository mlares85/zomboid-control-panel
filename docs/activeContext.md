# Active Context

## Current Focus
Docker-managed servers fully wired end-to-end. Setup wizard, backend
routes, container creation with shared base files, and PanelBridge
auto-install all deployed to Unraid. Need real-world testing of the
container actually running PZ (start-server.sh with the bind-mount
topology).

## Recent Decisions
- Alpine images won't work — PZ native libs (libpzexe_jni64.so, 
  libsteam_api.so) require glibc. Default image: eclipse-temurin:21-jre.
- Containers join a `zomboid-panel-net` bridge network so RCON traffic
  stays internal between panel and server containers.
- Game ports increment by 2 (game + direct connect UDP) to avoid
  collisions between multi-server setups.
- Removed ich777 ProjectZomboid container from Unraid — replaced by
  panel-managed Docker flow. Existing game files at
  /mnt/cache/appdata/projectzomboid/ kept as shared base.
- SSH deploy to Unraid: clone → build on server → stop → run with
  same env/mounts. Key: ~/.ssh/breakingbread_deploy, host: 192.168.1.85.

## Blockers / Open Questions
- Container may need additional Linux packages (lib32gcc-s1?) for PZ
  to actually run — untested at runtime yet.
- PZ start-server.sh expects to write to its install dir for logs/tmp
  but base is mounted read-only — may need a tmpfs or writable overlay.
- Dashboard.tsx (1,556 lines) and Backups.tsx (1,060+ lines) still
  need decomposition.
- Template frontend integration still pending (capture mods, preview).

## Next Steps
1. Test a Docker-managed server actually running PZ end-to-end on Unraid.
2. Fix any runtime issues (missing libs, read-only mount problems).
3. Template frontend: wire CreateTemplateDialog to capture mods.
