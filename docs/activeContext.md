# Active Context

## Current Focus
Upstream dev (fpsacha) is open to merge requests. Need to analyze upstream's
latest version and plan a migration path that preserves existing users' data
while adding all fork features. Installer abstraction complete — both native
and container installers built, routes refactored.

## Recent Decisions
- Strangler cutover done: POST /install and POST /steam-update now delegate
  SteamCMD spawning to NativeSteamCmdInstaller. Routes keep input validation,
  HTTP response shape, and post-install orchestration. onProgress callback
  bridges installer events to existing Socket.IO event names.
- ContainerSteamCmdInstaller wraps Docker-based PZ install behind the same
  interface. Pulls steamcmd image, runs against a named volume, polls logs.
- E2E "8 assertion mismatches" were actually 2 real mismatches (Settings
  World Map tab, Help & Wiki nav entry) plus flaky auth cascades from stale
  refresh tokens.
- NativeSteamCmdInstaller uses an `onProgress` callback instead of taking
  Socket.IO directly — keeps the service testable without a live server.
- Installer abstract base class follows the FileAccess pattern: abstract
  base with `_notImpl()` throwing defaults, concrete subclasses override,
  contract test suite IS the interface.
- Setup auto-detection scans platform-specific paths (Windows/Linux/Docker)
  for SteamCMD and existing PZ installs — exposed via
  `GET /api/server/setup/detect`.

## Blockers / Open Questions
- Upstream migration strategy: 130+ commits need to be organized into
  reviewable PRs. Need to diff upstream's latest vs our fork.
- Docker managed route (`POST /docker/managed/populate-base`) still uses
  baseVolumePopulator directly — could optionally switch to
  ContainerSteamCmdInstaller for consistency, but not required since the
  route has its own Socket.IO event names.

## Next Steps
1. Analyze upstream repo's latest version and plan migration/PR strategy.
2. Wire Docker managed populate-base route to ContainerSteamCmdInstaller
   (optional — low priority since it already works).
3. Continue provider abstraction: extract lifecycle capability next.
