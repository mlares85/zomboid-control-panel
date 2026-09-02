# Active Context

## Current Focus
Multi-server simultaneous support is the top priority. Upstream parity
sync (v1.2.12) and i18n foundation are complete. i18n component wiring
and upstream translation import are follow-up tasks.

## Recent Decisions
- Cherry-pick approach for upstream sync — architectures diverged too
  far (1,400+ commits) for merge/rebase. Reviewed through v1.2.12.
- TanStack Query introduced for dashboard polling (world stats, player
  vitals, weather). Existing pages stay on manual fetch; new polling
  features should use Query.
- i18n uses parseMissingKeyHandler to show raw keys for not-yet-wired
  strings — app stays functional during incremental extraction. The
  i18n agents produced component-level t() wiring in their worktrees
  that wasn't merged to main (only the locale JSON files were). Next
  session should pull those component changes from git reflog or redo.
- safeIo() proxy wraps all Socket.IO emits — synchronous throws can't
  crash the process anymore.

## Blockers / Open Questions
- Multi-server needs RCON connection pool + per-server dashboard with
  independent start/stop.
- Auto-update checker still points at fpsacha, not this fork.
- PanelBridge v1.7.48 needs live end-to-end verification on Unraid.
- Leftover worktrees from i18n agents may need manual cleanup if locked.

## Next Steps
1. Multi-server simultaneous support — connection pool, per-server RCON,
   dashboard with independent start/stop.
2. Finish i18n wiring — connect JSX strings to t() calls, then copy
   upstream fr/de/es/zh-CN/ht translations and adapt keys.
3. Deploy to Unraid — build fork-latest image, verify new features
   (world stats, vitals, weather, PanelBridge v1.7.48).
