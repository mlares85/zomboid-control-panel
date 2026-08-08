// Misc live-server RCON commands: save, chat message, weather. World events
// live in eventCommands.js and everything else in miscCommands.js — these
// don't fit lifecycle (process control), config (persisted .ini settings) or
// console (log reading), so they're grouped here as their own small domain,
// split further to keep every file under the project's line-count limit.
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { registerEventRoutes } from "./eventCommands.js";
import { registerMiscCommandRoutes } from "./miscCommands.js";

const log = createLogger("API:Server");

export function registerCommandRoutes(router) {
  registerSaveAndMessageRoutes(router);
  registerWeatherRoutes(router);
  registerEventRoutes(router);
  registerMiscCommandRoutes(router);
}

function registerSaveAndMessageRoutes(router) {
  // Save world
  router.post("/save", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const result = await rconService.save();
      res.json(result);
    } catch (error) {
      log.error(`Failed to save world: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  // Send server message
  router.post("/message", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      if (typeof message !== "string" || message.length > 1000) {
        return res
          .status(400)
          .json({ error: "Message must be a string under 1000 characters" });
      }

      // Strip newlines/carriage returns to prevent RCON protocol injection
      const safeMessage = message.replace(/[\r\n]/g, " ");

      const result = await rconService.serverMessage(safeMessage);
      res.json(result);
    } catch (error) {
      log.error(`Failed to send message: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}

function registerWeatherRoutes(router) {
  router.post("/weather/start-rain", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const { intensity } = req.body;
      const result = await rconService.startRain(intensity);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  router.post("/weather/stop-rain", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const result = await rconService.stopRain();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  router.post("/weather/start-storm", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const { duration } = req.body;
      const result = await rconService.startStorm(duration);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  router.post("/weather/stop", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const result = await rconService.stopWeather();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}
