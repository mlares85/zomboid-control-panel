import path from "path";
import { diagFail } from "../../diagHelpers.js";
import { FS_TIMEOUT_MS, safeStat, withTimeout } from "../../fsProbe.js";
import { scanSaveStats } from "../../saveScan.js";

// Flags stale *.lock files (>1h old) that block PZ from resuming a save.
// Stashes the scan result on req._diagSaveStats for the Storage section's
// save-size check later in the same /diagnostics request.
export async function checkStaleLocksAndSaveStats(checks, req, zPath, activeServer) {
  // Stale .lock files in the save folder — these block PZ from
  // resuming a save and are a classic "server won't boot, no obvious
  // error" symptom after a hard crash.
  if (zPath && activeServer.serverName) {
    const savesRoot = path.join(zPath, "Saves");
    const saveDirCandidates = [
      path.join(savesRoot, "Multiplayer", activeServer.serverName),
    ];
    if (
      activeServer.savename &&
      activeServer.savename !== activeServer.serverName
    ) {
      saveDirCandidates.push(
        path.join(savesRoot, "Multiplayer", activeServer.savename),
      );
    }
    let saveStats = null;
    let saveDirUsed = null;
    for (const sp of saveDirCandidates) {
      const st = await safeStat(sp);
      if (st && st.isDirectory()) {
        saveStats = await withTimeout(
          scanSaveStats(sp),
          FS_TIMEOUT_MS * 4,
          null,
        );
        saveDirUsed = sp;
        break;
      }
    }
    if (saveStats && saveStats.staleLocks.length > 0) {
      checks.push(
        diagFail(
          "server.staleLocks",
          "Stale lock files in save folder",
          `${saveStats.staleLocks.length} .lock file${saveStats.staleLocks.length === 1 ? "" : "s"} older than 1 hour in ${saveDirUsed}. PZ will refuse to load the save until they are removed.`,
          {
            category: "server",
            hint: "Stop the server, delete every *.lock file under the save folder, then restart.",
            meta: { staleLocks: saveStats.staleLocks.slice(0, 10) },
          },
        ),
      );
    }
    // Save-size info is emitted in the Storage section below — we
    // stash the stats on the response context via a per-request var.
    req._diagSaveStats = saveStats ? { ...saveStats, saveDirUsed } : null;
  }
}
