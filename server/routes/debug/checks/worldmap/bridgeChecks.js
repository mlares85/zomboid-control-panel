import panelBridgeService from "../../../../services/panelBridge.js";
import { diagFail, diagOk, diagWarn } from "../../diagHelpers.js";

// PanelBridge live-data health for the map (player/vehicle/safehouse feed).
// Returns the raw bridge status so the caller can echo it in the response.
export function checkBridgeLiveData(checks) {
  // ─── PanelBridge live data ────────────────────────────────────────
  const bridgeStatus = panelBridgeService?.getStatus?.() || null;
  const bridgeRunning = !!bridgeStatus?.isRunning;
  const modConnected = !!bridgeStatus?.modStatus;
  const statusAge = bridgeStatus?.statusFile?.age ?? null;

  if (!bridgeStatus || !bridgeStatus.configured) {
    checks.push(
      diagFail(
        "worldmap.bridge.configured",
        "PanelBridge not configured",
        "The map gets live player positions, vehicles and safehouses from PanelBridge. Without it, the map will show only the static base tiles.",
        {
          category: "worldmap",
          hint: "Configure the active server's Zomboid Data Path so the bridge folder can be located.",
        },
      ),
    );
  } else if (!bridgeRunning) {
    checks.push(
      diagWarn(
        "worldmap.bridge.running",
        "PanelBridge service not running",
        "The bridge service is configured but not currently polling. Live map data will be empty.",
        { category: "worldmap" },
      ),
    );
  } else if (!modConnected) {
    checks.push(
      diagWarn(
        "worldmap.bridge.mod",
        "Mod not connected",
        "PanelBridge is running but the in-game mod has not written status.json yet. Players, vehicles and safehouses will not appear.",
        {
          category: "worldmap",
          hint: "Start the PZ server and confirm the PanelBridge mod is in the active mod list.",
        },
      ),
    );
  } else if (statusAge !== null && statusAge > 15_000) {
    checks.push(
      diagWarn(
        "worldmap.bridge.heartbeat",
        "Mod heartbeat stale",
        `Last status.json update was ${Math.round(statusAge / 1000)}s ago. Live map data may be stale.`,
        { category: "worldmap" },
      ),
    );
  } else {
    checks.push(
      diagOk(
        "worldmap.bridge",
        "Live data feed healthy",
        `PanelBridge running, mod connected${statusAge !== null ? `, last heartbeat ${Math.round(statusAge / 1000)}s ago` : ""}.`,
        { category: "worldmap" },
      ),
    );
  }

  // Verify expected handler list — surfaced in the dedicated UI card,
  // no need to push an info check that inflates the summary count.

  return { bridgeStatus, modConnected, statusAge };
}
