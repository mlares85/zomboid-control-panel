// Docker mount auto-discovery endpoints. Mounted at the same base path as
// routes/servers.js (/api/servers) but registered first in index.js so these
// literal paths are matched before servers.js's GET /:id catch-all.
import express from "express";
import { createLogger } from "../utils/logger.js";
const log = createLogger("API:Discovery");
import { sanitizeError } from "../utils/sanitize.js";
import { normalizeRconHost } from "../services/rcon.js";
import { createServer } from "../database/init.js";
import {
  discoverMounts,
  probeInstallPath,
  probeDataPath,
  readServerIniSettings,
} from "../services/mountDiscovery.js";

const router = express.Router();

// GET /api/servers/discover-mounts — probe common bind-mount locations for
// PZ server files so Settings can offer a one-click "connect this" profile.
router.get("/discover-mounts", async (req, res) => {
  try {
    res.json({ mounts: discoverMounts() });
  } catch (error) {
    log.error(`Mount discovery failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// POST /api/servers/create-from-discovery — turn a discover-mounts result
// into a fully-populated local server profile, reading RCON settings from
// the discovered server's own INI instead of asking the user to retype them.
router.post("/create-from-discovery", async (req, res) => {
  try {
    const { installPath, dataPath, serverName, name } = req.body || {};
    if (!installPath || !dataPath) {
      return res
        .status(400)
        .json({ error: "installPath and dataPath are required" });
    }

    const installResult = probeInstallPath(installPath);
    if (!installResult.valid) {
      return res
        .status(400)
        .json({ error: "installPath does not look like a PZ server install" });
    }

    const dataResult = probeDataPath(dataPath);
    if (!dataResult.valid) {
      return res
        .status(400)
        .json({ error: "dataPath does not look like a PZ data folder" });
    }

    const resolvedName =
      serverName || dataResult.serverNames[0] || installResult.serverNames[0];
    if (!resolvedName) {
      return res.status(400).json({
        error: "No server config (Server/*.ini) found — specify serverName",
      });
    }

    const iniSettings = readServerIniSettings(dataPath, resolvedName);
    if (!iniSettings?.rconPassword) {
      return res.status(400).json({
        error: `RCON password not set in ${resolvedName}.ini — set RCONPassword on the server, then retry.`,
      });
    }

    const server = await createServer({
      name: name || iniSettings.publicName || resolvedName,
      serverName: resolvedName,
      installPath,
      zomboidDataPath: dataPath,
      rconHost: normalizeRconHost("127.0.0.1"),
      rconPort: iniSettings.rconPort,
      rconPassword: iniSettings.rconPassword,
      serverPort: iniSettings.serverPort,
      isRemote: false,
    });

    log.info(
      `Created server from discovered mount: ${server.name} (ID: ${server.id})`,
    );
    res
      .status(201)
      .json({ server, message: "Server created from discovered mount" });
  } catch (error) {
    log.error(`create-from-discovery failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
