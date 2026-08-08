import express from "express";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";

const log = createLogger("API:Discord");
const router = express.Router();

// Test Discord connection
router.post("/test", async (req, res) => {
  try {
    const { token } = req.body || {};

    if (typeof token !== "string" || token.length === 0 || token.length > 200) {
      return res
        .status(400)
        .json({ error: "Token must be a non-empty string (max 200 chars)" });
    }
    // Discord bot tokens are URL-safe base64-ish: letters/digits/_-./
    if (!/^[A-Za-z0-9._-]+$/.test(token)) {
      return res.status(400).json({ error: "Invalid token format" });
    }

    // Try to validate token by making a test request
    const response = await fetch("https://discord.com/api/v10/users/@me", {
      headers: {
        Authorization: `Bot ${token}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return res.status(400).json({ error: "Invalid token" });
    }

    const userData = await response.json();

    // Build invite URL with required permissions
    // VIEW_CHANNEL(1024) + SEND_MESSAGES(2048) + EMBED_LINKS(16384) + READ_MESSAGE_HISTORY(65536)
    const permissions = 84992;
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${userData.id}&permissions=${permissions}&scope=bot%20applications.commands`;

    res.json({
      success: true,
      bot: {
        username: userData.username,
        id: userData.id,
        discriminator: userData.discriminator,
        avatar: userData.avatar
          ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=128`
          : null,
      },
      inviteUrl,
    });
  } catch (error) {
    log.error(`Discord test failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Send test message
router.post("/test-message", async (req, res) => {
  try {
    const discordBot = req.app.get("discordBot");

    if (!discordBot) {
      return res.status(400).json({ error: "Discord bot not initialized" });
    }

    if (!discordBot.isRunning) {
      return res.status(400).json({ error: "Bot is not running" });
    }

    const sent = await discordBot.sendNotification(
      "🧪 **Test message** from PZ Server Manager",
    );
    if (!sent) {
      return res.status(502).json({
        error:
          "Discord rejected the message. Check the notification channel ID and that the bot can post there.",
      });
    }
    res.json({ success: true, message: "Test message sent" });
  } catch (error) {
    log.error(`Failed to send test message: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
