# Active Context

## Current Focus
Upstream dev (fpsacha) is open to merge requests. Need to analyze upstream's
latest version and plan a migration path. ServerManager decomposition in
progress — down from 1,624 to 1,375 lines so far.

## Recent Decisions
- Process detection extracted to `processDetection.js` (282 lines):
  scanDedicatedServerProcesses, scoreServerProcessOwnership,
  isWindowsDedicatedServerCommandLine, extractLaunchArgValue,
  normalizePathForCompare. ServerManager delegates via 3-line method.
- Removed unused `exec` import from serverManager.js (was only used in
  _scanDedicatedServerProcesses and _genericForceStop, both delegated).
- Config extraction attempted but loadServerConfig needs to take current
  config as seed (not hardcoded defaults) to avoid clobbering Docker fields.
  Identified regression: Object.assign(this, config) overwrites manually-set
  dockerContainerId/rconHost when DB has no value for them.

## ServerManager decomposition progress
| Extracted to | Lines removed | What |
|---|---|---|
| lifecycle/DockerLifecycle.js | ~30 | Docker start/stop delegation |
| lifecycle/NativeLifecycle.js | ~35 | Kill PIDs, generic force stop |
| processDetection.js | ~249 | Process scanning, ownership scoring |
| **Total removed** | **~314** | **1,624 → 1,375** |
| **Remaining target** | **~1,075** | **Need to reach ≤300** |

## Blockers / Open Questions
- Upstream migration: 140 fork commits vs 35 upstream commits since fork point.
  Upstream at v1.1.49, fork at v1.1.41. Many features overlap.
- Config extraction blocked by seed-vs-defaults issue in loadConfig.
- startServer() is 286 lines — largest remaining method, needs config
  assembly refactored before spawn can be delegated.

## Next Steps
1. Extract config I/O (loadConfig, get/saveServerConfig) with seed pattern.
2. Extract startServer() into a launch config builder + NativeLifecycle delegation.
3. Analyze upstream diff and plan PR strategy.
