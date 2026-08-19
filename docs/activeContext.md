# Active Context

## Current Focus
Upstream dev (fpsacha) is open to merge requests. Need to analyze upstream's
latest version and plan a migration path. ServerManager decomposition
milestone: 1,624 → 1,018 lines (-37%).

## ServerManager decomposition progress
| Extracted to | Lines | What |
|---|---|---|
| lifecycle/DockerLifecycle.js | 80 | Docker start/stop |
| lifecycle/NativeLifecycle.js | 193 | Process kill, generic force stop |
| processDetection.js | 282 | PZ process scanning, ownership scoring |
| serverConfigIo.js | 135 | INI parse/read/write, mod list, game port |
| serverNetwork.js | 75 | IP detection, network interfaces, public IP |
| launchConfigBuilder.js | 171 | Start command validation, platform spawn config |
| **Total extracted** | **936** | **ServerManager: 1,624 → 1,018 (-606)** |

## Remaining in ServerManager (1,018 lines)
- `loadConfig()` — 117 lines (complex `this.*` coupling, needs seed pattern)
- `startServer()` — ~100 lines (config assembly extracted, spawn/crash-detect remains)
- `restartServer()` — 114 lines (orchestration — belongs here per ARCHITECTURE.md)
- `stopServer()` — 73 lines (orchestration — belongs here)
- `getServerStatus()` — 73 lines (could extract but depends on many `this` fields)
- `_waitForImmediateCrash` — 40 lines
- Constructor/reloadConfig/loadConfig — ~150 lines
- Docker lifecycle delegation methods — ~50 lines
- Process detection delegation — ~45 lines
- Config/network delegations — ~30 lines

## Blockers / Open Questions
- Upstream migration: 140 fork commits vs 35 upstream commits since fork point.
  Upstream at v1.1.49, fork at v1.1.41.

## Next Steps
1. Analyze upstream diff and plan PR strategy.
