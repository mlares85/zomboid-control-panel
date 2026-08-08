import bridge from "../services/panelBridge.js";

// Apply to routes that require the PanelBridge mod to be running.
// Replaces inline `if (!bridge.isRunning) { return res.status(400).json(...) }`
// checks (63 occurrences in routes/panelBridge.js). `isRunning` implies
// `bridgePath` is configured — bridge.start() throws otherwise — so a single
// check covers both "never configured" and "configured but stopped".
// See: routes/panelBridge.js (GET /weather, GET /server-info,
// POST /weather/blizzard, POST /weather/stop)
export function requireBridge(req, res, next) {
  if (!bridge.isRunning) {
    return res
      .status(400)
      .json({ error: "Bridge not running. Start it first." });
  }
  req.bridge = bridge;
  next();
}
