# Active Context

## Current Focus
Onboarding overhaul, container log streaming, and Docker managed server
creation are complete and deployed. Next: Docker-managed backups and
client test fixes.

## Recent Decisions
- PZ has no `RCONEnabled` INI key — RCON is enabled implicitly when
  `RCONPassword` is non-empty. Pre-seed a stub INI with just `RCONPort`
  + `RCONPassword`; PZ inflates it preserving those values. No restarts
  or background patchers needed.
- VerifyStep must not pass server.rconPassword to the RCON connect
  endpoint — sanitizeServerResponse masks it to `••••••••`. Call
  rconApi.connect() with no args; the RCON service already has the real
  config from activateServer().
- AuthScreenLayout accepts a `wide` prop (max-w-3xl) for install flows
  that need more room than the login-form-sized max-w-md default.
- `/api/system/environment` bypasses auth — called right after account
  creation before the token roundtrip has settled.
- `improvements/structural-overhaul` branch merged into main. All new
  work committed directly to main.

## Blockers / Open Questions
- Backups for managed servers need Docker-aware implementation (exec or
  volume access) since the panel can't read the container's filesystem.
- 6 pre-existing client test failures (MountDiscoveryBanner,
  TemplateApplyPanel) — unrelated to onboarding work.

## Next Steps
1. Backups for managed servers (Docker-aware implementation).
2. Fix pre-existing client test failures.
3. Consider building a panel-owned Docker image (libs preinstalled,
   entrypoint as real file) instead of debian:bookworm-slim + first-boot
   apt-get — faster creation, no network dependency.
