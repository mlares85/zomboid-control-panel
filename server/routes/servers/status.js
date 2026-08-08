import express from "express";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { getServers, getActiveServer, getAllSettings } from "../../database/init.js";
import { isRemoteConfigConfigured } from "../../services/remoteConfigFiles.js";

const log = createLogger("API:Servers");
const router = express.Router();

// Per-server running status. Scans the host once for all PZ server processes
// and attributes each match to a configured server by comparing its install
// path against the process command line. Servers with no matching process
// are reported as not running. The active server's state is reported by
// serverManager directly so it stays consistent with /api/server/status.
router.get("/status", async (req, res) => {
  try {
    const serverManager = req.app.get("serverManager");
    const servers = await getServers();
    const activeServer = await getActiveServer();
    const activeId = activeServer?.id || null;

    let matched = [];
    let detectionError = null;
    if (serverManager?.getServerProcessDetails) {
      try {
        const result = await serverManager.getServerProcessDetails();
        matched = Array.isArray(result?.matched) ? result.matched : [];
      } catch (err) {
        detectionError = err.message;
        log.debug(`Per-server status detection failed: ${err.message}`);
      }
    }

    // Normalise install paths for comparison: lowercase + forward slashes.
    // Windows command lines may double-quote the path or use backslashes;
    // the substring check below covers both.
    const norm = (p) =>
      String(p || "")
        .toLowerCase()
        .replace(/\\/g, "/")
        .trim();

    const statuses = servers.map((server) => {
      const installPathNorm = norm(server.installPath);
      let running = false;
      let pid;
      if (installPathNorm) {
        for (const m of matched) {
          if (norm(m.cmd).includes(installPathNorm)) {
            running = true;
            pid = m.pid;
            break;
          }
        }
      }
      // Fallback: the active server's running state is authoritative even
      // when the install path doesn't appear in the command line (e.g. when
      // the process was started outside the panel and uses a different
      // working directory).
      if (!running && server.id === activeId && serverManager?.isRunning) {
        running = true;
      }
      return {
        id: server.id,
        name: server.name,
        running,
        pid: pid || null,
        isActive: server.id === activeId,
      };
    });

    res.json({
      servers: statuses,
      detectedProcesses: matched.length,
      detectionError,
    });
  } catch (error) {
    log.error(`Failed to get per-server status: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Get active server
router.get("/active", async (req, res) => {
  try {
    const server = await getActiveServer();
    if (!server) {
      return res.status(404).json({ error: "No active server configured" });
    }
    // Lets the UI stop hiding file-based pages once a remote server's Server
    // folder is reachable over SFTP.
    const remoteConfigConfigured = server.isRemote
      ? isRemoteConfigConfigured(await getAllSettings())
      : false;
    res.json({ server: { ...server, remoteConfigConfigured } });
  } catch (error) {
    log.error(`Failed to get active server: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
