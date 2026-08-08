import panelBridgeService from "../../../services/panelBridge.js";
import { diagFail, diagOk, diagSkip, diagWarn, fmtAge } from "../diagHelpers.js";
import { safePathExists, safePathWritable } from "../fsProbe.js";

// PanelBridge IPC health: bridge path config, writability, mod heartbeat.
export async function buildBridgeIpcChecks(checks, ctx) {
  const { serverRunning } = ctx;

  // ─── PanelBridge IPC ──────────────────────────────────────────────
  try {
    {
      const bridgeStatus = panelBridgeService?.getStatus?.() || null;
      if (!bridgeStatus?.configured) {
        checks.push(
          diagSkip(
            "bridge.configured",
            "PanelBridge bridge path",
            "Bridge path not yet configured (server may be starting up).",
            { category: "bridge" },
          ),
        );
      } else {
        checks.push(
          diagOk(
            "bridge.configured",
            "Bridge path configured",
            "Bridge IPC directory is set.",
            { category: "bridge" },
          ),
        );

        const bridgePath = bridgeStatus.bridgePath;
        if (await safePathWritable(bridgePath)) {
          checks.push(
            diagOk(
              "bridge.writable",
              "Bridge directory writable",
              "Panel can write commands.json for the mod.",
              { category: "bridge" },
            ),
          );
        } else if (!(await safePathExists(bridgePath))) {
          checks.push(
            diagWarn(
              "bridge.writable",
              "Bridge directory missing",
              "Bridge folder does not exist yet — it will be created when the mod first writes status.json.",
              { category: "bridge" },
            ),
          );
        } else {
          checks.push(
            diagFail(
              "bridge.writable",
              "Bridge directory not writable",
              "Panel can't write to the bridge directory. Mod won't receive commands.",
              {
                category: "bridge",
                hint:
                  process.platform === "linux"
                    ? "Check ownership / chmod on the Zomboid Lua folder (often needs the panel user to own ~/Zomboid)"
                    : "Check filesystem permissions on the Lua write folder",
              },
            ),
          );
        }

        const status = bridgeStatus.modStatus;
        const conn = bridgeStatus.connection;
        if (status?.alive) {
          checks.push(
            diagOk(
              "bridge.heartbeat",
              "Mod heartbeat fresh",
              `Status from mod ${fmtAge(status.age || 0)}.`,
              { category: "bridge" },
            ),
          );
        } else if (!serverRunning) {
          checks.push(
            diagSkip(
              "bridge.heartbeat",
              "Mod heartbeat",
              "Server is offline — heartbeat resumes when it starts.",
              { category: "bridge" },
            ),
          );
        } else if (conn?.statusFile?.exists) {
          checks.push(
            diagFail(
              "bridge.heartbeat",
              "Mod heartbeat stale",
              `Last heartbeat ${fmtAge(conn.statusFile.age || 0)}. Mod may have crashed or be unloaded.`,
              {
                category: "bridge",
                hint: "Check server console.txt for PanelBridge errors",
              },
            ),
          );
        } else {
          checks.push(
            diagFail(
              "bridge.heartbeat",
              "No mod heartbeat",
              "status.json has never been written. Mod is not loaded on the server.",
              {
                category: "bridge",
                hint: "Verify PanelBridge is in the server's mod list and Workshop subscription",
              },
            ),
          );
        }
      }
    }
  } catch (e) {
    checks.push(
      diagWarn(
        "bridge.error",
        "Bridge checks errored",
        `Bridge IPC checks could not run: ${e?.message || "unknown"}`,
        { category: "bridge" },
      ),
    );
  }
}
