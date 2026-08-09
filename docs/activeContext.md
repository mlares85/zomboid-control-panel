# Active Context

## Current Focus
Major structural overhaul complete. Onboarding wizard and Docker socket
integration in progress. All backend route files and 12/13 frontend pages
decomposed. Security audit done (9 findings fixed). Next: merge remaining
agents, build the unified first-run flow, push to fork.

## Recent Decisions
- Provider abstraction (native/docker-local/docker-managed/remote-sftp) is
  the architectural keystone — all Docker features build on it.
- Pattern-based secret masking replaces the hand-maintained allowlist that
  leaked JWT secret and Discord bot token.
- serverManager.start() must refuse to spawn native processes for non-native
  providers — prevents the "starts a second PZ process" bug.
- Unified AddServerFlow replaces three separate add-server code paths.

## Blockers / Open Questions
- Mods.tsx decomposition: third attempt produced a 572-line shell (workable
  but still over the 300-line target). ConflictsPanel.tsx (1,675 lines) also
  needs decomposition.
- Docker socket integration agent still running.
- Some worktree merges dropped the thin-shell page files — verify all pages
  are actually using their decomposed versions.

## Next Steps
1. Merge Docker socket integration + onboarding wizard agents.
2. Build the provider guard in serverManager.start() (5-line fix).
3. Push final state to fork, prepare focused PRs for upstream.
