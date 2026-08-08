import express from "express";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";

const log = createLogger("API:Discord");
const router = express.Router();

// Get command permissions
router.get("/permissions", async (req, res) => {
  try {
    const discordBot = req.app.get("discordBot");
    if (!discordBot) {
      return res.status(500).json({ error: "Discord bot not initialized" });
    }

    res.json({ permissions: discordBot.getCommandPermissions() });
  } catch (error) {
    log.error(`Failed to get command permissions: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Update command permissions
router.put("/permissions", async (req, res) => {
  try {
    const discordBot = req.app.get("discordBot");
    if (!discordBot) {
      return res.status(500).json({ error: "Discord bot not initialized" });
    }

    const { permissions } = req.body;
    if (!permissions || typeof permissions !== "object") {
      return res.status(400).json({ error: "Permissions object required" });
    }

    const updated = await discordBot.updateCommandPermissions(permissions);
    res.json({ success: true, permissions: updated });
  } catch (error) {
    log.error(`Failed to update command permissions: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
