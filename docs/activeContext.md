# Active Context

## Current Focus
Upstream parity sync (fpsacha v1.2.12). Security hardening, PanelBridge
Lua update, and critical bug fixes are done. Remaining: dashboard
enrichment (zombie count, player vitals, weather), i18n (6 languages),
and multi-server simultaneous support.

## Recent Decisions
- Upstream analyzed through v1.2.12 (2026-09-01). Cherry-pick approach
  rather than merge — architectures have diverged too far (1,400+ commits
  apart, different file structures, our cradle-to-grave vs their plug-in).
- JWT access token TTL reduced from 24h to 15m. Logout doesn't revoke
  tokens, so the TTL is the stolen-token window.
- INI key regexes anchored to line start (^/m) — prevents matching
  inside values like ServerWelcomeMessage.
- Socket.IO emits wrapped in safeIo() proxy — prevents synchronous
  throws from crashing the Node process.
- PanelBridge Lua updated v1.7.29 → v1.7.48 (straight file swap — our
  Lua was unmodified from fork point). Fixes saveWorld, getWeather,
  getPlayerDetails, getSandboxOptions, weather triggers, json.decode.
- Bridge installer switched from version-string to content comparison.
- CRLF line endings preserved on INI save (Windows PZ servers use CRLF).
- Backup restore now verifies SHA-256 checksum before extraction.

## Blockers / Open Questions
- Multi-server simultaneous running needs a connection pool (RCON per
  server) and dashboard showing all servers with live status.
- Auto-update checker points at upstream repo (fpsacha), not this fork.
  Needs to either point at mlares85 or be disabled.
- Windows Firewall rules (try netsh + fallback) not yet implemented.
- Docker bridge still needs live end-to-end testing on Unraid.
- PanelBridge Lua v1.7.48 needs end-to-end verification on Unraid.

## Next Steps
1. Dashboard enrichment — zombie count/world stats, player vitals,
   live weather (backend routes exist, just need UI components).
2. i18n — 6 languages, parallelized extraction with 10 haiku agents.
3. Multi-server simultaneous support — connection pool, per-server RCON.
4. Remaining upstream bug fixes — mods whitespace tolerance, RCON ban
   detection, scheduler script regeneration.
5. Point auto-updater at this fork or disable it.
