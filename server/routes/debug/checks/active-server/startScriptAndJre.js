import path from "path";
import { diagOk, diagWarn } from "../../diagHelpers.js";
import { safePathExists, safeStat } from "../../fsProbe.js";

// Verifies a start script and the bundled JRE are present under installPath.
export async function checkStartScriptAndJre(checks, activeServer, installPath) {
  if (installPath && (await safePathExists(installPath))) {
    const isWin = process.platform === "win32";
    const serverName = activeServer.serverName || "";
    // Linux is case-sensitive — list each script variant explicitly.
    const candidates = isWin
      ? [
          serverName ? `StartServer_${serverName}.bat` : null,
          "StartServer64.bat",
          "StartServer64_nosteam.bat",
          "StartServer32.bat",
        ]
      : [
          serverName ? `start-server_${serverName}.sh` : null,
          "start-server.sh",
          "start-server-nosteam.sh",
        ];
    let foundScript = null;
    let scriptStat = null;
    for (const name of candidates) {
      if (!name) continue;
      const p = path.join(installPath, name);
      const st = await safeStat(p);
      if (st && st.isFile()) {
        foundScript = name;
        scriptStat = st;
        break;
      }
    }
    if (foundScript) {
      // On Linux, verify the executable bit. On Windows, mode bits are
      // meaningless so we just confirm presence.
      if (!isWin && scriptStat && (scriptStat.mode & 0o111) === 0) {
        checks.push(
          diagWarn(
            "server.startScript",
            "Start script not executable",
            `${foundScript} exists but has no executable bit. The panel cannot launch it.`,
            { category: "server", hint: `Run: chmod +x ${foundScript}` },
          ),
        );
      } else {
        checks.push(
          diagOk(
            "server.startScript",
            "Start script found",
            `Using ${foundScript}.`,
            { category: "server" },
          ),
        );
      }
    } else {
      checks.push(
        diagWarn(
          "server.startScript",
          "Start script not found",
          `No ${isWin ? "StartServer*.bat" : "start-server*.sh"} in install path. Server can't be started from the panel.`,
          { category: "server" },
        ),
      );
    }

    // Java/JRE check — PZ ships its own JRE under jre64/.
    const isLinux = process.platform === "linux";
    const jreCandidates = isWin
      ? ["jre64/bin/java.exe", "jre/bin/java.exe"]
      : ["jre64/bin/java", "jre/bin/java"];
    let foundJre = null;
    for (const rel of jreCandidates) {
      const p = path.join(installPath, ...rel.split("/"));
      if (await safePathExists(p)) {
        foundJre = rel;
        break;
      }
    }
    if (foundJre) {
      checks.push(
        diagOk(
          "server.jre",
          "Bundled JRE present",
          `Found ${foundJre}.`,
          { category: "server" },
        ),
      );
    } else {
      checks.push(
        diagWarn(
          "server.jre",
          "Bundled JRE not found",
          `Could not locate jre64/bin/${isWin ? "java.exe" : "java"} under the install path. Server may fail to start unless system Java is on PATH.`,
          {
            category: "server",
            hint: isLinux
              ? "Most installs ship a JRE under jre64/. Re-run SteamCMD if missing."
              : "Re-run SteamCMD to restore the bundled JRE",
          },
        ),
      );
    }
  }
}
