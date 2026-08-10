# Active Context

## Current Focus
Docker-managed server support — panel can now create, own, and manage
Docker containers for PZ servers with shared base volumes. Per-server
RCON status probes landed. Setup wizard Docker option in progress.

## Recent Decisions
- Per-server RCON status: `GET /api/servers/rcon-status` probes all
  configured servers (3s timeout, max 3 concurrent). Dashboard cards
  show RCON signal for non-active servers.
- Docker-managed architecture: shared base volume (`zomboid-panel-base`)
  holds ~3GB PZ server files; per-server volumes (`zomboid-srv-{name}`)
  hold config/saves/mods. Containers use `eclipse-temurin:21-jre` image.
- Port auto-assignment: game ports from 16261, RCON from 27015,
  incrementing per server. `findAvailablePorts()` checks existing
  server list to avoid conflicts.
- Upstream comparison (2026-08-10): 22 upstream commits since fork,
  16 are our features adopted upstream. Only per-server RCON status
  was genuinely new — we built our own implementation.

## Blockers / Open Questions
- Dashboard.tsx is 1,556 lines — needs decomposition.
- Backups.tsx is 1,060+ lines — needs decomposition.
- "Fresh install" onboarding path is wrong for Unraid/ich777 topology
  (downloads redundant copy via separate SteamCMD). Docker option
  partially addresses this.
- Base volume population: need SteamCMD-into-volume flow or pre-built
  image support for first-time Docker server creation.
- Some frontend tests use jest-dom matchers that TypeScript doesn't
  recognize — runtime passes but LSP flags them.

## Next Steps
1. Complete Docker setup wizard (frontend in progress).
2. Base volume SteamCMD integration (download PZ files into shared volume).
3. Frontend: wire CreateTemplateDialog to call `GET /api/templates/capture`
   so "Save Current Config" includes mods.
4. Dashboard.tsx decomposition.
