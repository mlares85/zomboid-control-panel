# Active Context

## Current Focus
Gap analysis complete — all 19 findings fixed. Provider abstraction fully
wired end-to-end (LocalFiles + SftpMirrorFiles + remoteMirrorMiddleware).
All 7 monolith route files converted to shims (−14,740 lines). Wiki + 
FieldHelp tooltips on every page. Deployed to Unraid.

## Recent Decisions
- Monolith→shim conversion required security-hardening the decomposed
  directories first (5 of 7 had regressions vs the monolith). Sequence:
  audit → harden → shim. Test helpers needed for nested router stacks.
- Startup validation runs after Ready banner — detects UID/GID mismatch,
  missing mounts, provider misconfiguration, RCON loopback in containers.
  Fire-and-forget with its own .catch — never crashes startup.
- Unraid deploy uses PUID=99 PGID=100 (nobody:users) to match file
  ownership. Server profile fixed from docker-managed to docker-local
  with zomboidDataPath=/zomboid.
- Backup destinations (SFTP/Google Drive) are implemented but were never
  wired into any create-backup path. Now using createEnhancedBackup in
  scheduler. Frontend still needs destination selection UI.

## Blockers / Open Questions
- Backup destination selection UI not built yet (backend is ready)
- PZ server not validated running in managed Docker container
- E2E tests need a clean run (last failure was port conflict, not code)
- WorldMap.tsx version selector not wired to backend

## Next Steps
1. Build NativeSteamCmdInstaller + PZ install auto-detection during setup.
2. Add backup destination selection to create-backup UI.
3. Validate managed Docker container actually runs PZ (lib32gcc, tmpfs).
