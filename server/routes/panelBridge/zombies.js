/**
 * Zombie population control: counts, clearing, and horde spawning.
 */

import express from "express";
import bridge from "../../services/panelBridge.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { createLogger } from "../../utils/logger.js";
import { requireBridgeRunning } from "../../middleware/panelBridgeGuards.js";
import { BRIDGE_USERNAME_REGEX } from "./validation.js";

const log = createLogger("API:PanelBridge");
const router = express.Router();
const requireRunning = requireBridgeRunning("Bridge not running");

// Get zombie statistics
router.get("/zombies/count", requireRunning, async (req, res) => {
  try {
    const result = await bridge.sendCommand("getZombieCount", {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Clear zombies near a player
router.post("/zombies/clear-near-player", requireRunning, async (req, res) => {
  const { username, radius = 50 } = req.body;
  if (!username || !BRIDGE_USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: "Valid username is required" });
  }
  if (typeof radius !== "number" || radius < 1 || radius > 500) {
    return res.status(400).json({ error: "radius must be 1-500" });
  }
  try {
    const result = await bridge.sendCommand("clearZombiesNearPlayer", { username, radius });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Clear ALL zombies in loaded cells
router.post("/zombies/clear-all", requireRunning, async (req, res) => {
  try {
    log.info("Clearing all zombies");
    const result = await bridge.sendCommand("clearAllZombies", {});
    log.info(`Clear all zombies result: ${JSON.stringify(result)}`);
    res.json(result);
  } catch (error) {
    log.warn(`Clear all zombies failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Spawn horde near a player
router.post("/zombies/spawn-near", requireRunning, async (req, res) => {
  const { username, count = 50 } = req.body;
  if (!username || !BRIDGE_USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: "Valid username is required" });
  }
  const safeCount = Math.min(Math.max(Math.floor(Number(count) || 50), 1), 500);
  try {
    log.info(`Spawning horde near player: ${username} (count: ${safeCount})`);
    const result = await bridge.sendCommand("spawnHordeNearPlayer", { username, count: safeCount });
    log.info(`Spawn horde near result: ${JSON.stringify(result)}`);
    res.json(result);
  } catch (error) {
    log.warn(`Spawn horde near failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Spawn horde behind a player
router.post("/zombies/spawn-behind", requireRunning, async (req, res) => {
  const { username, count = 50 } = req.body;
  if (!username || !BRIDGE_USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: "Valid username is required" });
  }
  const safeCount = Math.min(Math.max(Math.floor(Number(count) || 50), 1), 500);
  try {
    log.info(`Spawning horde behind player: ${username} (count: ${safeCount})`);
    const result = await bridge.sendCommand("spawnHordeBehindPlayer", { username, count: safeCount });
    log.info(`Spawn horde behind result: ${JSON.stringify(result)}`);
    res.json(result);
  } catch (error) {
    log.warn(`Spawn horde behind failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
