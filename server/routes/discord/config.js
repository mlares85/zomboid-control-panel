import express from "express";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { normalizeChatRelayScope } from "../../services/discordBot.js";

const log = createLogger("API:Discord");
const router = express.Router();

// Get Discord bot config
router.get("/config", async (req, res) => {
  try {
    const discordBot = req.app.get("discordBot");
    if (!discordBot) {
      return res.status(500).json({ error: "Discord bot not initialized" });
    }

    await discordBot.loadConfig();

    // Load auto-start setting
    const { getSetting } = await import("../../database/init.js");
    const autoStart = await getSetting("discordAutoStart");

    res.json({
      token: discordBot.token ? "••••••••" + discordBot.token.slice(-4) : null,
      hasToken: !!discordBot.token,
      guildId: discordBot.guildId,
      adminRoleId: discordBot.adminRoleId,
      modRoleId: discordBot.modRoleId,
      channelId: discordBot.channelId,
      autoStart: autoStart !== false, // default true
      chatRelayEnabled: discordBot.chatRelayEnabled !== false,
      chatRelayChannelId: discordBot.chatRelayChannelId || "",
      chatRelayScope: normalizeChatRelayScope(discordBot.chatRelayScope),
    });
  } catch (error) {
    log.error(`Failed to get Discord config: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Discord Snowflake ID format
const SNOWFLAKE = /^\d{15,21}$/;

// Validate the Snowflake-format IDs in a config update payload.
// Returns an error message string, or null if valid.
function validateConfigIds({ guildId, adminRoleId, modRoleId, channelId, chatRelayChannelId, chatRelayScope }) {
  if (!SNOWFLAKE.test(guildId)) {
    return "Invalid Guild ID format (must be a Discord Snowflake)";
  }
  if (adminRoleId && !SNOWFLAKE.test(adminRoleId)) {
    return "Invalid Admin Role ID format";
  }
  if (modRoleId && !SNOWFLAKE.test(modRoleId)) {
    return "Invalid Mod Role ID format";
  }
  if (channelId && !SNOWFLAKE.test(channelId)) {
    return "Invalid Channel ID format";
  }
  if (chatRelayChannelId && !SNOWFLAKE.test(chatRelayChannelId)) {
    return "Invalid Chat Relay Channel ID format";
  }
  if (
    chatRelayScope !== undefined &&
    chatRelayScope !== "public" &&
    chatRelayScope !== "no-yell" &&
    chatRelayScope !== "general"
  ) {
    return "Invalid Chat Relay Scope";
  }
  return null;
}

// Save chat relay settings if any were provided in this update.
async function saveChatRelaySettings(discordBot, { chatRelayEnabled, chatRelayChannelId, chatRelayScope }) {
  if (
    typeof chatRelayEnabled !== "boolean" &&
    typeof chatRelayChannelId !== "string" &&
    typeof chatRelayScope !== "string"
  ) {
    return;
  }
  await discordBot.updateChatRelay(
    typeof chatRelayEnabled === "boolean" ? chatRelayEnabled : discordBot.chatRelayEnabled,
    typeof chatRelayChannelId === "string" ? chatRelayChannelId : discordBot.chatRelayChannelId,
    typeof chatRelayScope === "string" ? chatRelayScope : discordBot.chatRelayScope,
  );
}

// Update Discord bot config
router.put("/config", async (req, res) => {
  try {
    const {
      token,
      guildId,
      adminRoleId,
      modRoleId,
      channelId,
      autoStart,
      chatRelayEnabled,
      chatRelayChannelId,
      chatRelayScope,
    } = req.body;
    log.info(
      `PUT /config: guildId=${guildId}, token=${token ? (token === "KEEP_EXISTING" ? "KEEP" : "***") : "none"}, autoStart=${autoStart}`,
    );

    const discordBot = req.app.get("discordBot");
    if (!discordBot) {
      return res.status(500).json({ error: "Discord bot not initialized" });
    }

    // Load current config to check for existing token
    await discordBot.loadConfig();

    // Handle KEEP_EXISTING token marker
    const finalToken =
      token === "KEEP_EXISTING" && discordBot.token ? discordBot.token : token;

    if (!finalToken || !guildId) {
      return res.status(400).json({ error: "Token and Guild ID are required" });
    }

    const idsError = validateConfigIds({
      guildId,
      adminRoleId,
      modRoleId,
      channelId,
      chatRelayChannelId,
      chatRelayScope,
    });
    if (idsError) {
      return res.status(400).json({ error: idsError });
    }

    // Snapshot current auth credentials before overwriting them so we know
    // whether a full Discord reconnection is actually needed.
    const prevToken = discordBot.token;
    const prevGuildId = discordBot.guildId;

    await discordBot.updateConfig(
      finalToken,
      guildId,
      adminRoleId,
      channelId,
      modRoleId,
    );

    // Save auto-start preference
    if (typeof autoStart === "boolean") {
      const { setSetting } = await import("../../database/init.js");
      await setSetting("discordAutoStart", autoStart);
    }

    await saveChatRelaySettings(discordBot, { chatRelayEnabled, chatRelayChannelId, chatRelayScope });

    // Only reconnect if authentication-relevant credentials (token or guild ID)
    // changed. channelId, role IDs, and autoStart are hot-applied by updateConfig()
    // and do not require tearing down the Discord WebSocket connection.
    const credentialsChanged =
      prevToken !== finalToken || prevGuildId !== (guildId || null);
    if (discordBot.isRunning && credentialsChanged) {
      await discordBot.stop();
      await discordBot.start();
    }

    res.json({
      success: true,
      message: "Discord bot configuration updated",
    });
  } catch (error) {
    log.error(`Failed to update Discord config: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
