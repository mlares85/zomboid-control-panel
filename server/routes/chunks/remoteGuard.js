import { getActiveServer } from "../../database/init.js";

// Block all chunk operations for remote servers (no local filesystem access)
export async function remoteGuardMiddleware(req, res, next) {
  try {
    const activeServer = await getActiveServer();
    if (activeServer?.isRemote) {
      return res.status(400).json({
        error:
          "Map cleanup is not available for remote servers. The server filesystem is not accessible from this panel.",
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}
