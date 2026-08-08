import { diagFail, diagOk, diagWarn } from "../../diagHelpers.js";
import { safePathExists } from "../../fsProbe.js";

// Verifies the active server's Zomboid user data path is configured and
// reachable (saves, server config, and Server/*.ini all live under it).
export async function checkZomboidDataPath(checks, activeServer) {
  const zPath = activeServer.zomboidDataPath;
  if (!zPath) {
    checks.push(
      diagWarn(
        "server.zomboidData",
        "Zomboid data path not set",
        "Set the Zomboid user data folder so saves and config can be located.",
        {
          category: "server",
          hint: "Servers → Edit → Zomboid Data Path",
        },
      ),
    );
  } else if (await safePathExists(zPath)) {
    checks.push(
      diagOk(
        "server.zomboidData",
        "Zomboid data path exists",
        "Saves and server config directory is accessible.",
        { category: "server" },
      ),
    );
  } else {
    checks.push(
      diagFail(
        "server.zomboidData",
        "Zomboid data path not found",
        "Configured saves/config path does not exist.",
        {
          category: "server",
          hint:
            process.platform === "linux"
              ? "On Linux this is usually ~/Zomboid"
              : "On Windows this is usually %USERPROFILE%/Zomboid",
        },
      ),
    );
  }

  return zPath;
}
