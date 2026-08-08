import path from "path";
import { diagFail, diagOk, diagWarn } from "../../diagHelpers.js";
import { FS_TIMEOUT_MS, withTimeout } from "../../fsProbe.js";
import { parseServerIni } from "../../modScan.js";
import { checkBridgeModPresence } from "./bridgeMod.js";
import { checkConfigDrift } from "./configDrift.js";
import { checkCrashDetection } from "./crashDetection.js";
import { checkInstallPath } from "./installPath.js";
import { checkServerIniAndRcon } from "./iniAndRcon.js";
import { checkJreRuns } from "./jreRuns.js";
import { checkModsConsistency } from "./modsConsistency.js";
import { checkSandboxVars } from "./sandboxVars.js";
import { checkStartScriptAndJre } from "./startScriptAndJre.js";
import { checkStaleLocksAndSaveStats } from "./staleLocksAndSaveStats.js";
import { checkZomboidDataPath } from "./zomboidDataPath.js";

// Orchestrates every Active Server diagnostic sub-check in the same order
// the monolithic /diagnostics handler used to run them, threading the
// intermediate installPath/zPath/ini values between them exactly as before.
export async function buildActiveServerChecks(checks, req, activeServer) {
  try {
    if (!activeServer) {
      checks.push(
        diagFail(
          "server.active",
          "No active server",
          "Configure a server to enable most panel features.",
          { category: "server", hint: "Servers → Add Server" },
        ),
      );
    } else {
      checks.push(
        diagOk(
          "server.active",
          "Active server",
          `${activeServer.name || activeServer.serverName || "Unnamed"}.`,
          { category: "server" },
        ),
      );

      const installPath = await checkInstallPath(checks, activeServer);
      const zPath = await checkZomboidDataPath(checks, activeServer);
      await checkStartScriptAndJre(checks, activeServer, installPath);
      await checkServerIniAndRcon(checks, activeServer, zPath);
      await checkBridgeModPresence(checks, zPath, installPath);
      await checkCrashDetection(checks, zPath);

      // INI-driven checks (mods/workshop consistency, map validity, drift,
      // sandbox vars). Parsed once and reused.
      const iniPathForActive =
        zPath && activeServer.serverName
          ? path.join(zPath, "Server", `${activeServer.serverName}.ini`)
          : null;
      const ini = iniPathForActive
        ? await withTimeout(
            parseServerIni(iniPathForActive),
            FS_TIMEOUT_MS,
            null,
          )
        : null;

      await checkModsConsistency(checks, ini, installPath, zPath);
      checkConfigDrift(checks, activeServer, ini);
      await checkSandboxVars(checks, zPath, activeServer);
      await checkStaleLocksAndSaveStats(checks, req, zPath, activeServer);
      await checkJreRuns(checks, installPath);
    }
  } catch (e) {
    checks.push(
      diagWarn(
        "server.error",
        "Server checks errored",
        `Some active-server checks could not run: ${e?.message || "unknown"}`,
        { category: "server" },
      ),
    );
  }
}
