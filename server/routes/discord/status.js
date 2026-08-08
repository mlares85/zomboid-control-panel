import express from "express";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";

const log = createLogger("API:Discord");
const router = express.Router();

// Get Discord bot status
router.get("/status", async (req, res) => {
  try {
    const discordBot = req.app.get("discordBot");
    if (!discordBot) {
      return res.json({
        running: false,
        configured: false,
        error: "Discord bot not initialized",
      });
    }

    const status = discordBot.getStatus();
    res.json(status);
  } catch (error) {
    log.error(`Failed to get Discord bot status: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
