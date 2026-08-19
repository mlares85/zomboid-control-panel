# Active Context

## Current Focus
Upstream dev (fpsacha) is open to merge requests. Need to analyze upstream's
latest version and plan a migration path that preserves existing users' data
while adding all fork features. Provider abstraction milestone reached —
registry, installer, lifecycle, and file access all in place.

## Recent Decisions
- Static provider registry built: data-driven `createDefaultRegistry()`
  maps all four provider types to capability factories. Not yet wired into
  ServerManager — next step.
- ServerManager delegates `_killPids` and `_genericForceStop` to
  NativeLifecycle (net -35 lines from monolith). Docker start/stop already
  delegated to DockerLifecycle.
- Native start (spawn) not yet delegated — config assembly (custom commands,
  LD_LIBRARY_PATH, platform checks) needs extraction first.
- Provider registry entries declare `{label, capabilities, create(deps,cfg)}`
  — no if/else chains, composition is declarative.

## Blockers / Open Questions
- Upstream migration strategy: 130+ commits need to be organized into
  reviewable PRs. Need to diff upstream's latest vs our fork.
- NativeLifecycle.isRunning() is a known gap — process detection stays in
  ServerManager until the registry is wired.
- Native startServer() spawn logic not yet delegated to NativeLifecycle.launch()
  — config assembly (15+ fields) needs refactoring first.

## Next Steps
1. Analyze upstream repo's latest version and plan migration/PR strategy.
2. Wire ServerManager to use ProviderRegistry for capability lookup.
3. Extract native start config assembly into a builder so startServer()
   can delegate the spawn to NativeLifecycle.launch().
