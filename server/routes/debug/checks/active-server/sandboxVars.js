import fs from "fs";
import path from "path";
import { checkSandboxBraceBalance } from "../../../serverFiles.js";
import { diagFail, diagOk, diagWarn } from "../../diagHelpers.js";
import { safePathExists } from "../../fsProbe.js";

// Verifies SandboxVars.lua is present and its braces are balanced (an
// unbalanced file makes the dedicated server exit immediately on boot).
export async function checkSandboxVars(checks, zPath, activeServer) {
  // Sandbox vars file — admins edit this to set server-wide defaults.
  // Server boots without it (uses built-in defaults), which silently
  // ignores any tuning the user thought they applied.
  if (zPath && activeServer.serverName) {
    const sbxPath = path.join(
      zPath,
      "Server",
      `${activeServer.serverName}_SandboxVars.lua`,
    );
    if (await safePathExists(sbxPath)) {
      let braceCheck = null;
      try {
        const sbxContent = await fs.promises.readFile(sbxPath, "utf-8");
        braceCheck = checkSandboxBraceBalance(sbxContent);
      } catch {
        braceCheck = null;
      }

      if (braceCheck && !braceCheck.balanced) {
        checks.push(
          diagFail(
            "server.sandboxCorrupt",
            "SandboxVars.lua is corrupt",
            `${activeServer.serverName}_SandboxVars.lua has mismatched braces and will fail to load — the dedicated server exits immediately on boot with a Lua syntax error.`,
            {
              category: "server",
              hint: "Use the automated repair below, or restore from a .bak backup in the same folder.",
            },
          ),
        );
      } else {
        checks.push(
          diagOk(
            "server.sandboxVars",
            "SandboxVars present",
            `${activeServer.serverName}_SandboxVars.lua is in place.`,
            { category: "server" },
          ),
        );
      }
    } else {
      checks.push(
        diagWarn(
          "server.sandboxVars",
          "SandboxVars missing",
          `${activeServer.serverName}_SandboxVars.lua not found. Server will boot with built-in defaults; any custom sandbox tuning will be ignored.`,
          {
            category: "server",
            hint: "Open Server Config → Sandbox to generate one, or copy from another server.",
          },
        ),
      );
    }
  }
}
