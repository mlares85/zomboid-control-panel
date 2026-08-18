import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Files");
import { getActiveServer } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { LocalFiles, SftpMirrorFiles } from "../../services/fileAccess/index.js";
import { resolveRemoteConfigTransport, getServerName } from "./context.js";

// These read or write the panel host's own filesystem, so an SFTP mirror of
// the remote Server/ folder cannot stand in for them.
const LOCAL_ONLY_PATHS = new Set(["/browse-files", "/image-preview"]);

// Thrown from inside the withSession callback to abort the automatic push
// after a failed (non-GET) request — the response is already sent, so the
// outer catch just swallows it instead of re-responding.
class SkipPush extends Error {}

// Runs the rest of the middleware chain and resolves once the response is
// done, so the caller can push (or skip pushing) inside the session's
// pull/push lock. A 60s watchdog guards against a handler that never settles
// the response, so a stuck request cannot hold the mirror lock forever.
function runHandlerChain(req, res, next) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      if (req.method !== "GET" && res.statusCode >= 400) {
        reject(new SkipPush());
      } else {
        resolve();
      }
    };
    const watchdog = setTimeout(finish, 60000);
    watchdog.unref?.();
    res.on("finish", finish);
    res.on("close", finish);
    next();
  });
}

// A remote server has no local filesystem, but its Server/ folder is reachable
// over the SFTP credentials PanelBridge already uses. Attach a FileAccess for
// it to req.fileAccess and run the rest of the chain inside its session, which
// pulls fresh copies in before the handler runs and pushes back whatever the
// handler changed — so every handler below that reads req.fileAccess works
// unmodified for local or remote servers.
export async function remoteMirrorMiddleware(req, res, next) {
  let activeServer;
  try {
    activeServer = await getActiveServer();
  } catch (err) {
    return next(err);
  }

  if (!activeServer?.isRemote) {
    req.fileAccess = new LocalFiles();
    return next();
  }

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
  const fileAccess = new SftpMirrorFiles({
    sftpConfig: { ...transport, remotePath: transport.configPath },
    serverName,
  });
  req.fileAccess = fileAccess;

  try {
    await fileAccess.withSession({ serverName }, () =>
      runHandlerChain(req, res, next),
    );
  } catch (err) {
    if (err instanceof SkipPush) return;
    log.error(`Remote config session failed: ${err.message}`);
    if (!res.headersSent) {
      res.status(502).json({
        error: `Could not sync the remote server config folder: ${sanitizeError(err.message)}`,
      });
    }
  }
}
