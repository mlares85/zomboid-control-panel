# Active Context

## Current Focus
Massive upstream parity sync completed (fpsacha v1.2.12). Security,
PanelBridge Lua, bug fixes, dashboard enrichment, and i18n foundation
all done in one session. Next priority: multi-server simultaneous
support, then finish i18n wiring + import upstream translations.

## Recent Decisions
- Upstream analyzed through v1.2.12 (2026-09-01). Cherry-pick approach —
  architectures diverged too far for merge/rebase.
- JWT access token TTL reduced from 24h to 15m.
- INI key regexes anchored to line start (^/m flag).
- Socket.IO emits wrapped in safeIo() proxy.
- PanelBridge Lua updated v1.7.29 → v1.7.48 (straight file swap).
- Bridge installer switched from version-string to content comparison.
- CRLF line endings preserved on INI save.
- Backup restore verifies SHA-256 checksum before extraction.
- RCON BanSystem/whitelist rejection responses now detected (8 patterns).
- Scheduled restarts regenerate launch scripts (shared helper extracted).
- Mods whitespace tolerance via shared parseIniList() across 21 files.
- TanStack Query introduced for dashboard data fetching.
- i18next + react-i18next wired with import.meta.glob auto-discovery.
  21 English namespace locale files created. parseMissingKeyHandler
  shows raw keys until components are fully wired to t() calls.

## Blockers / Open Questions
- Multi-server simultaneous running needs a connection pool (RCON per
  server) and dashboard showing all servers with live status.
- Auto-update checker points at upstream repo (fpsacha), not this fork.
- PanelBridge Lua v1.7.48 needs end-to-end verification on Unraid.
- i18n: remaining JSX strings need wiring to t() calls (locale JSON
  files exist; app works with raw keys in the meantime).
- i18n: upstream fr/de/es/zh-CN/ht translations need copying + key
  adaptation to match our namespace structure.

## Next Steps
1. Multi-server simultaneous support — connection pool, per-server RCON,
   dashboard with independent start/stop.
2. Finish i18n wiring — connect remaining JSX strings to t() calls,
   then import upstream translations for 5 non-English languages.
3. Point auto-updater at this fork or disable it.
4. Deploy to Unraid and verify PanelBridge v1.7.48 end-to-end.
