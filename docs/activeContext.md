# Active Context

## Current Focus
Template export/import backend complete — mods (Workshop IDs + mod IDs)
are now captured and applied. Dead `/api/templates` routes wired. Next:
frontend integration so the Templates page actually uses the new mod
capture/apply, and onboarding refinements.

## Recent Decisions
- SteamCMD login dropped — PZ public betas (b42, etc.) work with
  anonymous login. Private beta keys are rare enough to handle via SSH.
- Template mods use Workshop ID + mod ID pairs, stored as
  `[{ workshopId, modId?, name? }]`. On apply, written to server INI's
  `WorkshopItems=` and `Mods=` lines with deduplication. SteamCMD
  auto-downloads on next server start.
- BranchSelector extracted as reusable component for onboarding +
  ServerSetup. Branches fetched from `GET /api/server/branches`.
- Project moved to `~/Documents/playground/zomboid-control-panel/`
  (was nested inside unraid-web, causing git confusion).

## Blockers / Open Questions
- Dashboard.tsx is 1,556 lines — needs decomposition.
- Backups.tsx is 1,060+ lines — needs decomposition.
- "Fresh install" onboarding path is wrong for Unraid/ich777 topology
  (downloads redundant copy via separate SteamCMD). Should steer toward
  auto-detect when existing PZ files are mounted.
- Some frontend tests use jest-dom matchers that TypeScript doesn't
  recognize — runtime passes but LSP flags them.

## Next Steps
1. Frontend: wire CreateTemplateDialog to call `GET /api/templates/capture`
   so "Save Current Config" includes mods.
2. Frontend: show mod list in TemplatePreviewDialog and ImportTemplateDialog
   so users see what mods a template will install.
3. Dashboard.tsx decomposition.
