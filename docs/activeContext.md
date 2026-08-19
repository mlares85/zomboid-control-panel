# Active Context

## Current Focus
ServerManager decomposition milestone reached (1,624 → 1,018). Upstream
analysis complete — 10-PR strategy planned, upstream-only features adopted.
Next: real-world smoke testing of refactored code paths, then start
submitting PRs to upstream.

## Recent Decisions
- Upstream PRs, not merge: 74 merge conflicts make a straight merge too
  risky. Submit fork improvements as focused PRs rebased onto upstream/main.
- 8 upstream test files dropped: they assume upstream's route shapes which
  differ from our decomposed routes. Our own tests cover the same behavior.
- loadConfig() left in ServerManager: extracting it requires a seed-pattern
  fix (Object.assign clobbers Docker fields when DB has no value). Too risky
  to refactor without integration testing first.
- startServer() spawn delegation uses buildLaunchConfig() to produce the
  config, but keeps _openLaunchLog/_waitForImmediateCrash in ServerManager
  since they need `this.serverProcess` state.

## Blockers / Open Questions
- No integration test environment available (macOS, no Docker) — refactored
  start/stop/install code paths need real-world smoke testing on Linux.
- 10 upstream files exist in both forks with different content (PanelBridge
  mod, SFTP transport, schemas) — need deliberate merge review.

## Next Steps
1. Smoke test on Linux/Docker: start, stop, install, update, config save.
2. Submit first upstream PRs (E2E tests, Wiki, Onboarding wizard).
3. Wire ProviderRegistry into ServerManager for capability lookup.
