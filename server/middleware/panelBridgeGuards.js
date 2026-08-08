/**
 * Shared "is the bridge ready" guards for PanelBridge routes.
 *
 * Extracted because the same `if (!bridge.isRunning) return 400 ...` check
 * was copy-pasted at the top of ~65 route handlers in the old monolithic
 * panelBridge.js. Kept as parameterized middleware (not a single hardcoded
 * message) because a few routes use a shorter error string — behavior is
 * preserved exactly per call site.
 */

import bridge from "../services/panelBridge.js";

export function requireBridgeConfigured(req, res, next) {
  if (!bridge.bridgePath) {
    return res.status(400).json({
      error: "Bridge not configured",
      detail:
        "PanelBridge is not configured. Go to Settings > PanelBridge to auto-configure it, or install PanelBridge.lua if not yet installed.",
      fixUrl: "/settings?tab=bridge",
    });
  }
  next();
}

export function requireBridgeRunning(
  message = "Bridge not running. Start it first.",
) {
  return (req, res, next) => {
    if (!bridge.isRunning) {
      return res.status(400).json({
        error: message,
        detail:
          "PanelBridge is not running. Go to Settings > PanelBridge to start it, or install PanelBridge.lua if not yet installed.",
        fixUrl: "/settings?tab=bridge",
      });
    }
    next();
  };
}
