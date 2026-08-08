import { getActiveServer } from "../database/init.js";

// Apply to routes that require an active server to be configured.
// Replaces inline
// `const activeServer = await getActiveServer(); if (!activeServer) {...}`
// checks. Attaches the fetched server as `req.activeServer` so handlers
// don't re-fetch it.
// See: routes/servers.js (GET /active), routes/debug.js (clear-lock-files)
//
// Pass { status, body } to match a specific handler's existing error text.
export function requireActiveServer({
  status = 404,
  body = { error: "No active server configured" },
} = {}) {
  return async function requireActiveServerMiddleware(req, res, next) {
    const activeServer = await getActiveServer();
    if (!activeServer) {
      return res.status(status).json(body);
    }
    req.activeServer = activeServer;
    next();
  };
}
