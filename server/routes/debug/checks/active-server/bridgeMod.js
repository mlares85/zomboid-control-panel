import path from "path";
import { diagOk, diagWarn } from "../../diagHelpers.js";
import { safePathExists } from "../../fsProbe.js";

// Detects whether the PanelBridge mod is deployed under the server's mods/
// Workshop trees or the install media path.
export async function checkBridgeModPresence(checks, zPath, installPath) {
  if (zPath || installPath) {
    // Cover both case variants (Linux is case-sensitive) and both
    // mods/ + Workshop/ trees + the server install media path.
    const bridgeCandidates = [];
    if (zPath) {
      for (const root of ["mods", "Mods"]) {
        bridgeCandidates.push(
          path.join(zPath, root, "PanelBridge", "mod.info"),
        );
        bridgeCandidates.push(
          path.join(
            zPath,
            root,
            "PanelBridge",
            "media",
            "lua",
            "server",
            "PanelBridge.lua",
          ),
        );
      }
      bridgeCandidates.push(
        path.join(zPath, "Workshop", "PanelBridge", "mod.info"),
      );
      bridgeCandidates.push(
        path.join(zPath, "workshop", "PanelBridge", "mod.info"),
      );
    }
    if (installPath) {
      bridgeCandidates.push(
        path.join(
          installPath,
          "media",
          "lua",
          "server",
          "PanelBridge.lua",
        ),
      );
      bridgeCandidates.push(
        path.join(
          installPath,
          "steamapps",
          "workshop",
          "content",
          "108600",
        ),
      );
    }
    let bridgeInstalled = false;
    for (const p of bridgeCandidates) {
      if (await safePathExists(p)) {
        bridgeInstalled = true;
        break;
      }
    }
    if (bridgeInstalled) {
      checks.push(
        diagOk(
          "server.bridgeMod",
          "PanelBridge mod present",
          "PanelBridge.lua is deployed on the server.",
          { category: "server" },
        ),
      );
    } else {
      checks.push(
        diagWarn(
          "server.bridgeMod",
          "PanelBridge mod not detected",
          "Couldn't find PanelBridge.lua under the server. Advanced features (teleport, weather, character export) will be unavailable.",
          {
            category: "server",
            hint: "Copy pz-mod/PanelBridge into the server's media/lua/server folder",
          },
        ),
      );
    }
  }
}
