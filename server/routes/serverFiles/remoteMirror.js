import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Files");
import { getActiveServer } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import {
  acquireMirrorLock,
  beginRemoteConfigSession,
  pushRemoteConfigFiles,
} from "../../services/remoteConfigFiles.js";
import { resolveRemoteConfigTransport, getServerName } from "./context.js";

// These read or write the panel host's own filesystem, so an SFTP mirror of
// the remote Server/ folder cannot stand in for them.
const LOCAL_ONLY_PATHS = new Set(["/browse-files", "/image-preview"]);

// A remote server has no local filesystem, but its Server/ folder is reachable
// over the SFTP credentials PanelBridge already uses. Mirror it in before the
// handler runs and push back whatever the handler changed, so every existing
// local-filesystem handler below works unmodified.
export async function remoteMirrorMiddleware(req, res, next) {
  let activeServer;
  try {
    activeServer = await getActiveServer();
  } catch (err) {
    return next(err);
  }
  if (!activeServer?.isRemote) return next();

  if (LOCAL_ONLY_PATHS.has(req.path)) {
    return res.status(400).json({
      error:
        "Browsing the server filesystem is not available for remote servers.",
    });
  }

  let transport;
  try {
    transport = await resolveRemoteConfigTransport();
  } catch (err) {
    return res.status(400).json({ error: sanitizeError(err.message) });
  }
  if (!transport) {
    return res.status(400).json({
      code: "REMOTE_CONFIG_NOT_CONFIGURED",
      error:
        "This server is remote. Add its SFTP details and the remote Server folder under Settings > PanelBridge to edit its configuration from here.",
    });
  }

  const serverName = await getServerName();
  const release = await acquireMirrorLock();
  let session;
  try {
    session = await beginRemoteConfigSession(transport, serverName, {
      fresh: req.method !== "GET",
    });
  } catch (err) {
    release();
    log.error(`Remote config pull failed: ${err.message}`);
    return res.status(502).json({
      error: `Could not read the remote server config folder: ${sanitizeError(err.message)}`,
    });
  }

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(watchdog);
    void (async () => {
      try {
        if (req.method !== "GET" && res.statusCode < 400) {
          await pushRemoteConfigFiles(transport, serverName, session);
        }
      } catch (err) {
        log.error(`Remote config push failed: ${err.message}`);
      } finally {
        release();
      }
    })();
  };
  const watchdog = setTimeout(finish, 60000);
  watchdog.unref?.();
  res.on("finish", finish);
  res.on("close", finish);
  next();
}
