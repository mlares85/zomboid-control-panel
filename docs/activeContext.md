# Active Context

## Current Focus
Upstream dev (fpsacha) is open to merge requests. Need to analyze upstream's
latest version and plan a migration path that preserves existing users' data
while adding all fork features. E2E port conflict is fixed; 8 remaining
test failures are UI assertion mismatches from new features.

## Recent Decisions
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
- 8 E2E test assertion failures from UI changes (new Settings tab, renamed
  nav items) — need test updates, not code fixes.
- NativeSteamCmdInstaller not yet built (provider abstraction milestone).

## Next Steps
1. Analyze upstream repo's latest version and plan migration/PR strategy.
2. Fix remaining 8 E2E test assertion mismatches.
3. Build NativeSteamCmdInstaller + PZ install auto-detection during setup.
