# Active Context

## Current Focus
Upstream dev (fpsacha) is open to merge requests. Need to analyze upstream's
latest version and plan a migration path that preserves existing users' data
while adding all fork features. NativeSteamCmdInstaller service built; next
is wiring routes to delegate to it (strangler cutover).

## Recent Decisions
- E2E "8 assertion mismatches" were actually 2 real mismatches (Settings
  World Map tab, Help & Wiki nav entry) plus flaky auth cascades from stale
  refresh tokens. The auth fixture re-logs in when tokens expire, but the
  default `e2e_admin` credentials can fail against the dev server if it has
  different accounts.
- NativeSteamCmdInstaller uses an `onProgress` callback instead of taking
  Socket.IO directly — keeps the service testable without a live server.
- Installer abstract base class follows the FileAccess pattern: abstract
  base with `_notImpl()` throwing defaults, concrete subclasses override,
  contract test suite IS the interface.
- Setup auto-detection scans platform-specific paths (Windows/Linux/Docker)
  for SteamCMD and existing PZ installs — exposed via
  `GET /api/server/setup/detect`.
- Map version checker uses a separate service class (not inline in resolution)
  to keep the periodic polling testable and stoppable on shutdown.
- Backup destination selection is in the page header (not a dialog) because
  it's a per-backup choice, not a global setting. Scheduler uses all enabled
  destinations automatically.
- Docker managed containers install 32-bit libs via inline entrypoint rather
  than a custom Dockerfile — avoids requiring users to build/push images.
- E2E isolation uses DATA_DIR env var rather than a test-specific config file
  so it composes with the existing paths.js resolution without new plumbing.
- Fork merged into main and pushed. Upstream dev open to merge requests.

## Blockers / Open Questions
- Upstream migration strategy: 130+ commits need to be organized into
  reviewable PRs. Need to diff upstream's latest vs our fork.
- Routes still inline SteamCMD spawn logic alongside the new installer
  service — strangler cutover pending.
- ContainerSteamCmdInstaller not yet built (wrapping baseVolumePopulator).

## Next Steps
1. Analyze upstream repo's latest version and plan migration/PR strategy.
2. Wire install/update routes to delegate to NativeSteamCmdInstaller.
3. Build ContainerSteamCmdInstaller (wrapping baseVolumePopulator.js).
