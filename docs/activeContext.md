# Active Context

## Current Focus
Docker-managed server creation flow is working end-to-end: container
creation, PZ boot, RCON connection, dashboard green status. Several
UX improvements and feature requests queued from smoke testing.

## Recent Decisions
- `debian:bookworm-slim` as managed container base — PZ bundles JRE 25,
  no image-provided Java needed. eclipse-temurin conflicted with PATH.
- SQLite native lib pre-extracted from JAR in entrypoint — PZ's
  JNI-launched JVM can't extract it at runtime from the JAR.
- Data volume mounts at `/root/Zomboid` — PZ running as root ignores
  HOME for data paths. Direct mount is simpler than symlinks.
- `zomboidDataPath: null` for managed servers — panel can't access
  the managed container's filesystem, so bridge/backups paths are skipped.
- Bridge warning skipped for `docker-managed` provider — filesystem IPC
  doesn't work across containers; RCON is the control channel.
- Panel compose needs `networks: zomboid-panel-net: external: true` to
  survive container restarts and still reach managed containers via DNS.

## Blockers / Open Questions
- PanelBridge mod auto-install for managed containers — the mod needs
  to be in the base server files or injected into the container.
- Backups for managed servers need Docker-aware implementation (exec or
  volume access) since the panel can't read the container's filesystem.
- Container log streaming not yet implemented (user requested).

## Next Steps
1. Add container log streaming to dashboard (Docker API → Socket.IO).
2. Add server boot stage progress UI (parse PZ console milestones).
3. Auto-install PanelBridge mod into managed containers on creation.
