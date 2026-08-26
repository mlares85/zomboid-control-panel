# Active Context

## Current Focus
Windows fresh install UX testing uncovered multiple issues. Several are
fixed; the panel still does not auto-start the PZ server after install,
so the VerifyStep's RCON check hangs waiting for a server that isn't running.

## Recent Decisions
- Dynamic imports (`await import(...)`) break `pkg` binaries — esbuild
  skips them, so the module is missing at runtime. All converted to static.
- SteamCMD exit code 7 accepted as success (CWorkThreadPool race) but
  code 8 reverted — too ambiguous, may indicate real failure.
- SteamCMD default paths moved from C:\ root to Documents/ (SteamCMD
  and pz-server) so non-admin users can write there without UAC issues.
- Startup scripts are now platform-specific: .bat-only on Windows,
  .sh-only on Linux — no cross-platform scripts that confuse users.
- Admin password promoted from hidden Advanced Options to the main RCON
  card with yellow highlight — it's required and users were getting
  blocked at the review step without knowing why.

## Blockers / Open Questions
- Panel does not auto-start the PZ server after install — VerifyStep
  waits for RCON, user has to manually start the server first. Need to
  either auto-start or show clear instructions.
- Windows Firewall rules could be auto-created with `netsh` when running
  as admin, or shown as copy-paste commands. Decided on approach 1 (try
  + fallback) but not yet implemented.
- Docker bridge still needs live end-to-end testing on Unraid.
- SteamCMD 0x202 "update required" can still fail if disk is truly full
  even after 3 retries — the preflight check should catch most cases.

## Next Steps
1. Auto-start server after install or add clear "Start your server" step
   before VerifyStep's RCON check — this is the biggest UX gap.
2. Implement Windows Firewall rule creation (try netsh + fallback to
   copy-paste commands).
3. End-to-end test Docker bridge on Unraid.
