// Apply to routes that require the Zomboid server process to actually be
// running (as opposed to RCON connectivity, which requireRcon covers).
// The inverse guard ("refuse while running", e.g. wipe/update/clear-locks)
// is common in routes/server.js and routes/debug.js, but none of today's
// routes need this positive direction yet — it's scaffolding for the next
// handler that does (e.g. a "force a save" or "send message" action that
// should fail fast instead of waiting on an RCON auto-connect timeout).
//
// Pass { status, body } to match a specific handler's existing error text.
export function requireServerRunning({
  status = 400,
  body = { success: false, error: "Server is not running" },
} = {}) {
  return async function requireServerRunningMiddleware(req, res, next) {
    const serverManager = req.app.get("serverManager");
    const running =
      typeof serverManager?.checkServerRunning === "function"
        ? await serverManager.checkServerRunning()
        : !!serverManager?.isRunning;
    if (!running) {
      return res.status(status).json(body);
    }
    req.serverManager = serverManager;
    next();
  };
}
