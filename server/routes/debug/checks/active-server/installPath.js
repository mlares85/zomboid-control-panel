import { diagFail, diagOk } from "../../diagHelpers.js";
import { safePathExists } from "../../fsProbe.js";

// Verifies the active server's install path is configured and reachable.
// Distinguishes an unreachable network mount from a plain missing path.
export async function checkInstallPath(checks, activeServer) {
  const installPath = activeServer.installPath || activeServer.serverPath;
  if (!installPath) {
    checks.push(
      diagFail(
        "server.installPath",
        "Install path missing",
        "Active server has no installPath configured.",
        { category: "server", hint: "Servers → Edit → Install Path" },
      ),
    );
  } else if (await safePathExists(installPath)) {
    checks.push(
      diagOk(
        "server.installPath",
        "Install path exists",
        "Server installation directory is accessible.",
        { category: "server" },
      ),
    );
  } else {
    // Distinguish "not mounted / unreachable" (UNC, NFS) vs "plain missing".
    const isUnc = /^\\\\/.test(installPath) || /^\/\//.test(installPath);
    const isNetMount =
      isUnc ||
      installPath.startsWith("/mnt/") ||
      installPath.startsWith("/media/");
    checks.push(
      diagFail(
        "server.installPath",
        "Install path not found",
        isNetMount
          ? "Network share or mount not reachable. Check VPN, mount, or share availability."
          : "Configured install path does not exist or is unreadable.",
        {
          category: "server",
          hint: isNetMount
            ? "Verify the share is mounted and credentials are valid"
            : "Check the path in Servers → Edit",
        },
      ),
    );
  }

  return installPath;
}
