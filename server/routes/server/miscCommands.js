// Misc RCON commands: alarm, zombie cleanup, lua reload, log level, stats,
// safehouse release.
import { createLogger } from "../../utils/logger.js";
import { logServerEvent } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { validateInt } from "./shared.js";

const log = createLogger("API:Server");

const VALID_LOG_TYPES = [
  "General",
  "Network",
  "Multiplayer",
  "Voice",
  "Packet",
  "NetworkFileDebug",
  "Lua",
  "Mod",
  "Sound",
  "Zombie",
  "Combat",
  "Objects",
  "Fireplace",
  "Radio",
  "MapLoading",
  "Clothing",
  "Animation",
  "Asset",
  "Script",
  "Shader",
  "Input",
  "Recipe",
  "ActionSystem",
  "IsoRegion",
  "UniTests",
  "FileIO",
  "Ownership",
  "Death",
  "Damage",
  "Statistic",
  "Vehicle",
  "Checksum",
];

const VALID_LOG_LEVELS = ["Trace", "Debug", "General", "Warning", "Error"];

export function registerMiscCommandRoutes(router) {
  // Alarm - sound building alarm
  router.post("/alarm", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const result = await rconService.alarm();
      await logServerEvent("alarm");
      res.json(result);
    } catch (error) {
      log.error(`Failed to trigger alarm: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  // Remove zombies
  router.post("/removezombies", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const result = await rconService.removeZombies();
      await logServerEvent("removezombies");
      res.json(result);
    } catch (error) {
      log.error(`Failed to remove zombies: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  // Reload Lua script
  router.post("/reloadlua", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const { filename } = req.body;

      if (!filename) {
        return res.status(400).json({ error: "Filename is required" });
      }

      // Validate filename - allow alphanumeric, underscores, dots, and forward slashes only
      // Block backslashes and '..' to prevent path traversal
      if (!/^[a-zA-Z0-9_/.\-]+\.lua$/.test(filename) || filename.includes("..")) {
        return res.status(400).json({ error: "Invalid filename format" });
      }

      const result = await rconService.reloadLua(filename);
      await logServerEvent("reloadlua", filename);
      res.json(result);
    } catch (error) {
      log.error(`Failed to reload Lua: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  // Set log level
  router.post("/log", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const { type, level } = req.body;

      if (!type || !level) {
        return res.status(400).json({ error: "Type and level are required" });
      }

      if (!VALID_LOG_TYPES.includes(type)) {
        return res
          .status(400)
          .json({ error: `Invalid log type. Valid: ${VALID_LOG_TYPES.join(", ")}` });
      }

      if (!VALID_LOG_LEVELS.includes(level)) {
        return res
          .status(400)
          .json({ error: `Invalid log level. Valid: ${VALID_LOG_LEVELS.join(", ")}` });
      }

      const result = await rconService.setLogLevel(type, level);
      res.json(result);
    } catch (error) {
      log.error(`Failed to set log level: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  // Server statistics
  router.post("/stats", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const { mode, period } = req.body;

      if (!mode) {
        return res.status(400).json({ error: "Mode is required" });
      }

      const validModes = ["none", "file", "console", "all"];
      if (!validModes.includes(mode.toLowerCase())) {
        return res
          .status(400)
          .json({ error: `Invalid mode. Valid: ${validModes.join(", ")}` });
      }

      const validPeriod = period ? validateInt(period, 1, 3600, null) : null;

      const result = await rconService.setStats(mode, validPeriod);
      res.json(result);
    } catch (error) {
      log.error(`Failed to set stats: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  // Release safehouse
  router.post("/releasesafehouse", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const result = await rconService.releaseSafehouse();
      res.json(result);
    } catch (error) {
      log.error(`Failed to release safehouse: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}
