# Active Context

## Current Focus
Upstream dev (fpsacha) is open to merge requests. Need to analyze upstream's
latest version and plan a migration path that preserves existing users' data
while adding all fork features. Provider abstraction well underway — installer
fully wired, lifecycle extracted with Docker delegation live.

## Recent Decisions
- ServerManager now delegates Docker start/stop to DockerLifecycle via
  `_dockerLifecycle()` helper. State tracking (isRunning, startTime), event
  logging, and skipRunningCheck semantics stay in ServerManager.
- NativeLifecycle extracted: launch (spawn), terminate (kill PIDs),
  terminateAll (generic pkill/taskkill fallback). isRunning() is a known gap
  (process detection is complex and server-specific — stays in ServerManager).
- All three installer routes (install, steam-update, populate-base) now use
  the Installer service layer.
- Lifecycle/Installer abstract bases follow the FileAccess pattern: contract
  test suite IS the interface.

## Blockers / Open Questions
- Upstream migration strategy: 130+ commits need to be organized into
  reviewable PRs. Need to diff upstream's latest vs our fork.
- NativeLifecycle.isRunning() is a known gap — process detection stays in
  ServerManager until the provider registry is fully wired.

## Next Steps
1. Analyze upstream repo's latest version and plan migration/PR strategy.
2. Wire ServerManager native start/stop to NativeLifecycle.
3. Build the static provider registry (FileAccess + Installer + Lifecycle
   composed per provider type).
