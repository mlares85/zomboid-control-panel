// World-event RCON commands: chopper, gunshot, lightning, thunder, horde.
import { sanitizeError } from "../../utils/sanitize.js";
import { validateInt } from "./shared.js";

export function registerEventRoutes(router) {
  router.post("/events/chopper", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const result = await rconService.triggerChopper();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  router.post("/events/gunshot", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const result = await rconService.triggerGunshot();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  router.post("/events/lightning", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const { username } = req.body;
      if (username && (typeof username !== "string" || username.length > 64)) {
        return res.status(400).json({ error: "Invalid username" });
      }
      const result = await rconService.triggerLightning(username);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  router.post("/events/thunder", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const { username } = req.body;
      if (username && (typeof username !== "string" || username.length > 64)) {
        return res.status(400).json({ error: "Invalid username" });
      }
      const result = await rconService.triggerThunder(username);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  router.post("/events/horde", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const { count, username } = req.body;
      const safeCount = validateInt(count, 1, 500, 50);
      if (username && (typeof username !== "string" || username.length > 64)) {
        return res.status(400).json({ error: "Invalid username" });
      }
      const result = await rconService.createHorde(safeCount, username);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}
