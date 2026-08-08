/**
 * V1.2.0 sound/noise endpoints — zombie-attracting sounds at coordinates,
 * near a player, or as gunshot/alarm presets.
 */

import express from "express";
import bridge from "../../services/panelBridge.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { requireBridgeRunning } from "../../middleware/panelBridgeGuards.js";
import { BRIDGE_USERNAME_REGEX } from "./validation.js";

const router = express.Router();
const requireRunning = requireBridgeRunning();

// Play sound at world coordinates
router.post("/sound/world", requireRunning, async (req, res) => {
  const { x, y, z, radius, volume } = req.body;
  if (x === undefined || y === undefined) {
    return res.status(400).json({ error: "x and y coordinates are required" });
  }
  if (typeof x !== "number" || typeof y !== "number" || x < 0 || x > 24000 || y < 0 || y > 24000) {
    return res.status(400).json({ error: "Coordinates out of range (valid: 0-24000)" });
  }
  try {
    const result = await bridge.playWorldSound(x, y, z, radius, volume);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Play sound near a player
router.post("/sound/near-player", requireRunning, async (req, res) => {
  const { username, radius, volume } = req.body;
  if (!username || !BRIDGE_USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: "Valid username is required" });
  }
  try {
    const result = await bridge.playSoundNearPlayer(username, radius, volume);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to play sound" });
  }
});

// Trigger gunshot sound
router.post("/sound/gunshot", requireRunning, async (req, res) => {
  const { x, y, z, username } = req.body;
  if (username && !BRIDGE_USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: "Invalid username format" });
  }
  try {
    const result = await bridge.triggerGunshot({ x, y, z, username });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to trigger gunshot" });
  }
});

// Trigger alarm sound
router.post("/sound/alarm", requireRunning, async (req, res) => {
  const { x, y, z, username } = req.body;
  if (username && !BRIDGE_USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: "Invalid username format" });
  }
  try {
    const result = await bridge.triggerAlarmSound({ x, y, z, username });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Create custom noise
router.post("/sound/noise", requireRunning, async (req, res) => {
  const { x, y, z, radius, volume, username } = req.body;
  if (username && !BRIDGE_USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: "Invalid username format" });
  }
  try {
    const result = await bridge.createNoise({ x, y, z, radius, volume, username });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
