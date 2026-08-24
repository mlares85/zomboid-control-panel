# Active Context

## Current Focus
Docker-managed backups and client test fixes are complete. Upstream repo
(fpsacha/zomboid-control-panel) has diverged significantly with v1.2.0/1.2.1
— critical security fixes need cherry-picking, and a major integration
sprint is needed for the RBAC permissions system.

## Recent Decisions
- Docker-managed server backups use the Docker archive API
  (`GET /containers/{id}/archive`) to stream save files as tar, gzip on
  the fly — no exec or tools needed inside the container. Always full
  backups (no incremental for container-backed servers since we can't
  cheaply scan directory contents). Format is always tar.gz.
- `backupCreateHandler` routes docker-managed servers through
  `createDockerBackup` instead of the filesystem-based pipeline.
- Shared helpers (`uploadToDestinations`, `resolvePlayerCount`,
  `resolveWorldAge`) exported from backupOrchestrator for reuse.
- Client test fixes: tests were cherry-picked from upstream (commit
  942a482) without updating for fork-specific component changes.

## Blockers / Open Questions
- Upstream has 12 critical security fixes (unauthenticated admin takeover,
  permission bypass, privilege escalation, SSRF, etc.) that need
  cherry-picking or integration. See upstream analysis from 2026-08-24.
- Full upstream integration (v1.2.x) requires a major sprint — 663 commits
  behind, 108 file conflicts, RBAC permissions system touches every route.
- Docker-managed server restore not yet implemented (needs putArchive or
  volume mount approach).

## Next Steps
1. Cherry-pick critical security fixes from upstream.
2. Cherry-pick world map tile host migration (`ebd4c82` — tiles moved to
   `tiles.pzmap.org`, old URL 404s everything).
3. Cherry-pick targeted bug fixes (mod conflict OOM, RCON kick reason,
   god mode targeting wrong player).
4. Plan major upstream integration sprint for RBAC/OIDC/i18n.
5. Consider building a panel-owned Docker image.
