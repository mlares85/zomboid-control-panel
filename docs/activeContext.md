# Active Context

## Current Focus
Cherry-picking critical security fixes and targeted bug fixes from
upstream (fpsacha/zomboid-control-panel v1.2.1). Docker-managed backups
and client test fixes are complete.

## Recent Decisions
- Docker backups use Docker archive API (getArchive) — no exec needed.
  Always full/tar.gz since we can't scan container contents cheaply.
- Upstream integration via cherry-pick, not merge — 108 file conflicts
  make a direct merge infeasible. RBAC/OIDC needs a dedicated sprint.
- Security fixes are priority — several allow unauthenticated access or
  privilege escalation that affect our fork.

## Blockers / Open Questions
- Some upstream security fixes target the RBAC permissions system we
  don't have yet — those will need adaptation to our single-admin model.
- World map tiles moved to tiles.pzmap.org upstream — our fork still
  points to the old URL that 404s.
- Docker-managed restore not yet implemented.

## Next Steps
1. Cherry-pick 12 critical security fixes from upstream (adapt as needed).
2. Cherry-pick world map tile host fix and targeted bug fixes (mod OOM,
   RCON kick reason, god mode targeting).
3. Plan major upstream integration sprint for RBAC/OIDC/i18n.
