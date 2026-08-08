import path from "path";
import { diagFail, diagOk } from "../../diagHelpers.js";
import { safePathExists, withTimeout } from "../../fsProbe.js";
import { probeJre } from "../../probes.js";

// Actually executes the bundled JRE (`java -version`) to catch a truncated
// SteamCMD install that the plain file-presence check would miss.
export async function checkJreRuns(checks, installPath) {
  // Actually run the bundled JRE to make sure it's not a truncated
  // SteamCMD install. The existing `server.jre` check only verifies
  // the binary file is present.
  if (installPath) {
    const isWin = process.platform === "win32";
    const jreCandidates = isWin
      ? ["jre64/bin/java.exe", "jre/bin/java.exe"]
      : ["jre64/bin/java", "jre/bin/java"];
    let javaBin = null;
    for (const rel of jreCandidates) {
      const p = path.join(installPath, ...rel.split("/"));
      if (await safePathExists(p)) {
        javaBin = p;
        break;
      }
    }
    if (javaBin) {
      const probe = await withTimeout(probeJre(javaBin), 5000, {
        ok: false,
        error: "timeout",
      });
      if (probe.ok) {
        checks.push(
          diagOk(
            "server.jreWorks",
            "Bundled JRE runs",
            probe.version || "java -version executed successfully.",
            { category: "server" },
          ),
        );
      } else {
        checks.push(
          diagFail(
            "server.jreWorks",
            "Bundled JRE failed to run",
            `java -version did not succeed: ${probe.error || "unknown"}.${probe.output ? " Output: " + probe.output : ""}`,
            {
              category: "server",
              hint: "Re-run SteamCMD to reinstall the JRE, or ensure the bundled libraries are present alongside the binary.",
            },
          ),
        );
      }
    }
  }
}
