import path from "path";
import { diagOk, diagWarn } from "../../diagHelpers.js";
import { safePathExists } from "../../fsProbe.js";

// Verifies server.ini presence and that an RCON password is configured.
export async function checkServerIniAndRcon(checks, activeServer, zPath) {
  // server.ini lives under <zomboidDataPath>/Server/<serverName>.ini
  if (zPath && activeServer.serverName) {
    const iniPath = path.join(
      zPath,
      "Server",
      `${activeServer.serverName}.ini`,
    );
    if (await safePathExists(iniPath)) {
      checks.push(
        diagOk(
          "server.ini",
          "server.ini found",
          `${activeServer.serverName}.ini is in place.`,
          { category: "server" },
        ),
      );
    } else {
      checks.push(
        diagWarn(
          "server.ini",
          "server.ini not found",
          `${activeServer.serverName}.ini is not in <zomboidData>/Server/. The server will create defaults on first run.`,
          { category: "server" },
        ),
      );
    }
  }

  if (
    !activeServer.rconPassword ||
    activeServer.rconPassword.length === 0
  ) {
    checks.push(
      diagWarn(
        "server.rconPassword",
        "RCON password not set",
        "No RCON password configured. RCON commands will fail.",
        {
          category: "server",
          hint: "Servers → Edit → RCON Password (must match server.ini)",
        },
      ),
    );
  } else {
    checks.push(
      diagOk(
        "server.rconPassword",
        "RCON password configured",
        "RCON password is set in panel config.",
        { category: "server" },
      ),
    );
  }
}
