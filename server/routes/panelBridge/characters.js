/**
 * V1.5.0 character export/import — XP, perks, skills, traits, inventory.
 */

import express from "express";
import bridge from "../../services/panelBridge.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { requireBridgeRunning } from "../../middleware/panelBridgeGuards.js";
import { BRIDGE_USERNAME_REGEX } from "./validation.js";

const router = express.Router();
const requireRunning = requireBridgeRunning();

// Export character data (XP, perks, skills, traits, inventory)
router.post("/character/export", requireRunning, async (req, res) => {
  const { username } = req.body;
  if (!username || !BRIDGE_USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: "Invalid or missing username" });
  }
  try {
    const result = await bridge.sendCommand("exportPlayerData", { username });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Import character data (apply XP, perks to player)
router.post("/character/import", requireRunning, async (req, res) => {
  const { username, data, options } = req.body;
  if (!username || !BRIDGE_USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: "Invalid or missing username" });
  }
  if (!data) {
    return res.status(400).json({ error: "Character data is required" });
  }
  // Validate data is an object with expected structure
  if (typeof data !== "object" || Array.isArray(data)) {
    return res.status(400).json({ error: "Character data must be an object" });
  }
  // Check for at least one valid data section
  const validSections = [
    "perks",
    "xp",
    "skills",
    "traits",
    "recipes",
    "stats",
    "inventory",
    "wornItems",
  ];
  const hasValidSection = validSections.some((section) => data[section] !== undefined);
  if (!hasValidSection) {
    return res.status(400).json({
      error: "Character data must contain at least one of: " + validSections.join(", "),
    });
  }
  try {
    const result = await bridge.sendCommand("importPlayerData", { username, data, options });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
