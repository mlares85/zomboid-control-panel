# Active Context

## Current Focus
All 12 upstream security fixes and 7 bug fixes integrated from
fpsacha/zomboid-control-panel v1.2.1-v1.2.2. Docker-managed backups
complete. Next: upstream RBAC/OIDC/i18n integration planning or
panel-owned Docker image.

## Recent Decisions
- Auth middleware switched from blanket `/api/auth/` exemption to an
  explicit `PUBLIC_AUTH_PATHS` set — the blanket exemption left recovery
  codes, /me, and /change-password unauthenticated.
- `requireRole()` fails closed (401 on missing req.user) instead of
  passing through. Synthetic admin user set during setup/auth-disabled.
- Upstream cherry-picks adapted to our single-admin model rather than
  porting the full RBAC permissions.js — direct merge not feasible
  (663 commits, 108 file conflicts).
- World map zoom fix adapted to our split mapProxy/ module structure
  (upstream has monolithic mapProxy.js).

## Blockers / Open Questions
- Full upstream integration (RBAC, OIDC, i18n) needs a dedicated sprint
  — every route file in upstream was rewritten for capability checks.
- Scheduler `rcon.execute` capability check (4a7dc86) skipped — requires
  the RBAC capability system we don't have yet.
- Docker-managed server restore not yet implemented.

## Next Steps
1. Plan upstream RBAC integration sprint (or decide to stay single-admin).
2. Build panel-owned Docker image (libs preinstalled, faster creation).
3. Implement Docker-managed server restore (putArchive or volume mount).
