import express from "express";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";

const log = createLogger("API:Discord");
const router = express.Router();

// Start Discord bot
router.post("/start", async (req, res) => {
  try {
    log.info("POST /start — starting Discord bot");
    const discordBot = req.app.get("discordBot");
    if (!discordBot) {
      return res.status(500).json({ error: "Discord bot not initialized" });
    }

    if (discordBot.isRunning) {
      return res.json({ success: true, message: "Bot is already running" });
    }

    const started = await discordBot.start();

    if (started) {
      res.json({ success: true, message: "Discord bot started" });
    } else {
      res
        .status(400)
        .json({ error: "Failed to start bot - check configuration" });
    }
  } catch (error) {
    log.error(`Failed to start Discord bot: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Stop Discord bot
router.post("/stop", async (req, res) => {
  try {
    const discordBot = req.app.get("discordBot");
    if (!discordBot) {
      return res.status(500).json({ error: "Discord bot not initialized" });
    }

    if (!discordBot.isRunning) {
      return res.json({ success: true, message: "Bot is not running" });
    }

    await discordBot.stop();
    res.json({ success: true, message: "Discord bot stopped" });
  } catch (error) {
    log.error(`Failed to stop Discord bot: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Reset Discord bot configuration
router.post("/reset", async (req, res) => {
  try {
    const discordBot = req.app.get("discordBot");
    if (!discordBot) {
      return res.status(500).json({ error: "Discord bot not initialized" });
    }

    await discordBot.resetConfig();
    res.json({
      success: true,
      message: "Discord bot settings wiped. Setup can start from scratch.",
    });
  } catch (error) {
    log.error(`Failed to reset Discord config: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
