import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Chunks");

// Refuse to mutate save files while the server is running — it will write
// them back on shutdown and corrupt the save, or hold vehicles.db open
// on Windows and cause the DB write to fail mid-flight.
//
// Issue #5: detection can false-positive when the user runs the server
// via a custom systemd unit / launcher we don't recognise, or when an
// unrelated java process matches our heuristics. We surface the matched
// process info and accept `force: true` so users can override after
// confirming the server really is stopped.
//
// Shared between /delete-chunks and /delete-region. Returns a response
// payload (with `status`) if the request should be blocked, or null if the
// caller may proceed.
export async function checkServerNotRunning(req, force, routeLabel) {
  if (force) {
    log.warn(`${routeLabel}: server-running check bypassed via force=true`);
    return null;
  }

  try {
    const serverManager = req.app.get("serverManager");
    if (
      serverManager &&
      typeof serverManager.getServerProcessDetails === "function"
    ) {
      const details = await serverManager.getServerProcessDetails();
      if (details.running) {
        return {
          status: 400,
          body: {
            error:
              "Stop the server before deleting chunks. Running servers hold save files open and will overwrite your changes on shutdown.",
            code: "server_running",
            matched: details.matched,
          },
        };
      }
    } else if (
      serverManager &&
      typeof serverManager.checkServerRunning === "function"
    ) {
      const isRunning = await serverManager.checkServerRunning();
      if (isRunning) {
        return {
          status: 400,
          body: {
            error:
              "Stop the server before deleting chunks. Running servers hold save files open and will overwrite your changes on shutdown.",
            code: "server_running",
          },
        };
      }
    }
  } catch (e) {
    log.warn(
      `Server-running check failed (proceeding cautiously): ${e.message}`,
    );
  }

  return null;
}
