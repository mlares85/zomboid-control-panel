import express from "express";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";

const log = createLogger("API:Discord");
const router = express.Router();

// Default events - all disabled
const DEFAULT_EVENTS = {
  serverStart: {
    enabled: false,
    template:
      "🟢 **Server Started**\nThe Project Zomboid server is now online!",
  },
  serverStop: {
    enabled: false,
    template: "🔴 **Server Stopped**\nThe server has been shut down.",
  },
  playerJoin: {
    enabled: false,
    template: "👋 **{player}** joined the server",
  },
  playerLeave: {
    enabled: false,
    template: "👋 **{player}** left the server",
  },
  scheduledRestart: {
    enabled: false,
    template:
      "⏰ **Scheduled Restart**\nServer will restart in {minutes} minutes",
  },
  backupComplete: {
    enabled: false,
    template: "💾 **Backup Complete**\nBackup created successfully",
  },
  playerDeath: { enabled: false, template: "💀 **{player}** has died" },
};

// Whitelist allowed event keys to prevent arbitrary data storage
const VALID_EVENT_KEYS = Object.keys(DEFAULT_EVENTS);

// Get webhook events configuration
router.get("/webhook-events", async (req, res) => {
  try {
    const discordBot = req.app.get("discordBot");
    if (!discordBot) {
      return res.json({ events: {} });
    }

    const savedEvents = discordBot.webhookEvents || {};
    const events = { ...DEFAULT_EVENTS, ...savedEvents };

    res.json({ events });
  } catch (error) {
    log.error(`Failed to get webhook events: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Update webhook events configuration
router.put("/webhook-events", async (req, res) => {
  try {
    const discordBot = req.app.get("discordBot");
    if (!discordBot) {
      return res.status(500).json({ error: "Discord bot not initialized" });
    }

    const { events } = req.body;
    if (!events || typeof events !== "object") {
      return res.status(400).json({ error: "Events configuration required" });
    }

    const sanitizedEvents = {};
    for (const key of VALID_EVENT_KEYS) {
      if (events[key] && typeof events[key] === "object") {
        const template =
          typeof events[key].template === "string"
            ? events[key].template.slice(0, 500)
            : "";
        sanitizedEvents[key] = {
          // An enabled event with a blank template would send an empty message,
          // which Discord rejects and which counts against the circuit breaker.
          enabled: !!events[key].enabled && template.trim().length > 0,
          template,
        };
      }
    }

    // Merge rather than replace so a partial update can't silently wipe the
    // events it didn't mention.
    const merged = { ...(discordBot.webhookEvents || {}), ...sanitizedEvents };
    await discordBot.saveWebhookEvents(merged);

    res.json({ success: true, message: "Webhook events updated" });
  } catch (error) {
    log.error(`Failed to update webhook events: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
