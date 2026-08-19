# Active Context

## Current Focus
Upstream dev (fpsacha) is open to merge requests. Need to analyze upstream's
latest version and plan a migration path that preserves existing users' data
while adding all fork features. Provider abstraction progressing — installer
and lifecycle capabilities extracted, routes wired.

## Recent Decisions
- Lifecycle abstract base class extracted: `launch()`, `terminate()`,
  `isRunning()`. DockerLifecycle adapter wraps Docker container start/stop
  with `_guard()` helper for availability/ref checks. ServerManager not yet
  modified — next step is delegation.
- Populate-base route wired to ContainerSteamCmdInstaller — all three
  installer routes now use the Installer service layer.
- Strangler cutover done: POST /install and POST /steam-update delegate
  SteamCMD spawning to NativeSteamCmdInstaller. onProgress callback
  bridges installer events to existing Socket.IO event names.
- Installer abstract base class follows the FileAccess pattern: abstract
  base with `_notImpl()` throwing defaults, concrete subclasses override,
  contract test suite IS the interface.

## Blockers / Open Questions
- Upstream migration strategy: 130+ commits need to be organized into
  reviewable PRs. Need to diff upstream's latest vs our fork.

## Next Steps
1. Analyze upstream repo's latest version and plan migration/PR strategy.
2. Wire ServerManager to delegate Docker start/stop to DockerLifecycle.
3. Extract NativeLifecycle (child process spawn/kill) from ServerManager.
