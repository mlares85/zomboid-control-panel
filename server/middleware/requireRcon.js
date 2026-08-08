// Apply to routes that require RCON connectivity.
// Replaces inline `if (!rconService?.isConnected()) return res.json(...)` checks.
// See: routes/server.js (POST /stop), routes/serverFiles.js (POST /save-and-reload)
//
// Pass { status, body } to match a specific handler's existing error text —
// call sites word the same guard differently, so this consolidates the
// branching logic without silently changing every response body.
export function requireRcon({
  status = 400,
  body = {
    error: "RCON not connected",
    detail:
      "RCON is not connected. Check your RCON host, port, and password in Settings > RCON.",
    fixUrl: "/settings?tab=connection",
  },
} = {}) {
  return function requireRconMiddleware(req, res, next) {
    const rconService = req.app.get("rconService");
    if (!rconService?.isConnected?.()) {
      return res.status(status).json(body);
    }
    req.rconService = rconService;
    next();
  };
}
