# Active Context

## Current Focus
Provider abstraction COMPLETE end-to-end: FileAccess interface with LocalFiles
+ SftpMirrorFiles, wired into remoteMirrorMiddleware. Wiki/help system live
with 26 articles + contextual FieldHelp tooltips across all major pages.
README updated for fork features.

## Recent Decisions
- Server provider architecture: composition-of-capabilities (FileAccess,
  Lifecycle, Installer, Stats) rather than one fat interface. Fable 5
  reviewed and shaped the design. See ARCHITECTURE.md.
- SftpMirrorFiles wraps existing remoteConfigFiles.js SFTP mirror system.
  Session-aware withSession() handles lock/pull/handler/push/release.
  remoteMirrorMiddleware sets req.fileAccess for all route handlers.
- Wiki uses structured ArticleBlock[] data (not markdown). Client-side
  search with title/tag/body scoring. FieldHelp component provides
  context-aware tooltips with recommendation badges and wiki links.
- ServerConfig field help uses a lookup map keyed by INI/sandbox setting
  name, auto-wired into IniSettingRow and SandboxSettingRow renderers.
- E2E fixtures handle login fallback (stale JWT) and always persist
  storageState to handle refresh token rotation.

## Blockers / Open Questions
- PZ server hasn't been validated running in the managed container.
  May need lib32gcc-s1, tmpfs for install dir writes.
- ADMIN_PASSWORD env var doesn't propagate — PZ reads admin pwd from
  server INI, needs a first-run config injection step.
- WorldMap.tsx version selector frontend not yet wired (backend ready).

## Next Steps
1. Build NativeSteamCmdInstaller for Windows/Linux local server installs.
2. Build Lifecycle provider (extract start/stop/terminate from ServerManager).
3. Test managed container actually running PZ — fix runtime issues.
4. Wire WorldMap.tsx version selector to /api/map/versions.
5. Continue decomposing oversized pages (Servers.tsx, ServerSetup.tsx, Discord.tsx).
