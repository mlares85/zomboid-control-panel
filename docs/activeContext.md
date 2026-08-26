# Active Context

## Current Focus
PanelBridge for Docker-managed servers, Pushover notifications, and
upstream security hardening are all shipped and deployed to Unraid.
The DockerBridgeTransport exec-based IPC and install-docker route are
wired but need end-to-end testing on the live server.

## Recent Decisions
- Docker bridge uses exec-based sync (3s polling) to a local cache dir,
  same pattern as SFTP transport — main PanelBridge reads the cache as
  usual, no changes to its polling loop.
- PanelBridge.lua installed into managed containers via putArchive (tar
  upload to Docker API) rather than shared volumes — no compose changes
  needed, works with any container setup.
- Pushover is independent of Discord — no shared notification abstraction
  until a third channel is added. Alert conditions are pure evaluators
  with edge-triggered monitoring (30s poll, cooldown per condition).
- Auth middleware blanket `/api/auth/` exemption replaced with explicit
  PUBLIC_AUTH_PATHS set. requireRole fails closed (401 on missing user).

## Blockers / Open Questions
- Docker bridge needs live end-to-end testing — the PZ server must have
  run at least once to create the panelbridge directory structure inside
  the container before the exec transport can read status.json.
- Upstream RBAC/OIDC/i18n integration still needs a dedicated sprint
  (663 commits, 108 file conflicts).
- PanelBridge Lua enhancements (sandbox vars, weather, zombie density)
  deferred until bridge is confirmed working for all providers.

## Next Steps
1. End-to-end test Docker bridge on Unraid — verify bridge connects and
   world map shows player positions for the docker-managed server.
2. Plan upstream RBAC integration sprint or decide to stay single-admin.
3. Consider building a panel-owned Docker image (preinstalled libs).
