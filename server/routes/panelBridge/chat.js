/**
 * Chat broadcast endpoints. Admin/general/alert prefer PanelBridge (richer
 * targeting) but fall back to RCON servermsg when the bridge isn't
 * available — both transports are tried, so these routes don't use the
 * simple bridge-running guard the way most others do.
 */

import express from "express";
import bridge from "../../services/panelBridge.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { requireBridgeRunning } from "../../middleware/panelBridgeGuards.js";

const router = express.Router();

// Get chat info
router.get("/chat/info", requireBridgeRunning("Bridge not running"), async (req, res) => {
  try {
    const result = await bridge.sendCommand("getChatInfo", {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Helper: try sending a chat message via RCON servermsg
async function trySendViaRcon(req, text) {
  const rconService = req.app.get("rconService");
  if (!rconService || !rconService.connected) return null;
  const result = await rconService.serverMessage(text, { skipLog: true });
  return result?.success ? result : null;
}

// Send to admin chat
router.post("/chat/admin", async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== "string" || message.length > 2000) {
    return res.status(400).json({ error: "message is required (max 2000 chars)" });
  }
  try {
    // Try PanelBridge first (only way to target admin-only chat)
    if (bridge.isRunning) {
      const result = await bridge.sendCommand("sendToAdminChat", { message });
      if (result?.success && result?.data?.method !== "player:Say") {
        return res.json(result);
      }
    }
    // Fallback: RCON with [ADMIN] prefix (visible to all players)
    const rconResult = await trySendViaRcon(req, `[ADMIN] ${message}`);
    if (rconResult) {
      return res.json({
        success: true,
        data: { message: "Admin message sent via RCON (visible to all)", method: "RCON" },
      });
    }
    return res.status(400).json({ error: "Neither PanelBridge nor RCON available for admin chat" });
  } catch (error) {
    // Still try RCON on PanelBridge error
    try {
      const rconResult = await trySendViaRcon(req, `[ADMIN] ${message}`);
      if (rconResult) {
        return res.json({
          success: true,
          data: { message: "Admin message sent via RCON (visible to all)", method: "RCON" },
        });
      }
    } catch (_) {
      /* ignore */
    }
    res.status(500).json({ error: "Failed to send admin message" });
  }
});

// Send to general chat with author
router.post("/chat/general", async (req, res) => {
  const author =
    typeof req.body.author === "string"
      ? req.body.author.trim().slice(0, 64) || "Server"
      : "Server";
  const { message } = req.body;
  if (!message || typeof message !== "string" || message.length > 2000) {
    return res.status(400).json({ error: "message is required (max 2000 chars)" });
  }
  try {
    // Try PanelBridge first (supports custom author via ChatServer)
    if (bridge.isRunning) {
      const result = await bridge.sendCommand("sendToGeneralChat", { message, author });
      if (result?.success && result?.data?.method !== "player:Say") {
        return res.json(result);
      }
    }
    // Fallback: RCON with author prefix
    const rconResult = await trySendViaRcon(req, `[${author}] ${message}`);
    if (rconResult) {
      return res.json({
        success: true,
        data: { message: "Message sent via RCON", author, method: "RCON" },
      });
    }
    return res.status(400).json({ error: "Neither PanelBridge nor RCON available for chat" });
  } catch (error) {
    try {
      const rconResult = await trySendViaRcon(req, `[${author}] ${message}`);
      if (rconResult) {
        return res.json({
          success: true,
          data: { message: "Message sent via RCON", author, method: "RCON" },
        });
      }
    } catch (_) {
      /* ignore */
    }
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Send server alert
router.post("/chat/alert", async (req, res) => {
  const { message, alert = true } = req.body;
  if (!message || typeof message !== "string" || message.length > 2000) {
    return res.status(400).json({ error: "message is required (max 2000 chars)" });
  }
  try {
    // RCON servermsg is the most reliable for server-wide messages
    const rconResult = await trySendViaRcon(req, message);
    if (rconResult) {
      return res.json({
        success: true,
        data: { message: "Alert sent via RCON", isAlert: alert, method: "RCON" },
      });
    }
    // Fallback: PanelBridge
    if (bridge.isRunning) {
      const result = await bridge.sendCommand("sendToServerChat", { message, alert });
      return res.json(result);
    }
    return res.status(400).json({ error: "Neither RCON nor PanelBridge available" });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
