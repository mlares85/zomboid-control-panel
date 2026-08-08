/**
 * Player queries and admin actions: list/detail, teleport, give-item, heal,
 * kill, god mode, invisibility.
 */

import express from "express";
import bridge from "../../services/panelBridge.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { requireBridgeRunning } from "../../middleware/panelBridgeGuards.js";
import { BRIDGE_USERNAME_REGEX } from "./validation.js";

const router = express.Router();
const requireRunning = requireBridgeRunning();
const requireRunningShort = requireBridgeRunning("Bridge not running");

// Player endpoints
router.get("/players", requireRunning, async (req, res) => {
  try {
    const result = await bridge.getAllPlayerDetails();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.get("/players/:username", requireRunning, async (req, res) => {
  if (!BRIDGE_USERNAME_REGEX.test(req.params.username)) {
    return res.status(400).json({ error: "Invalid username format" });
  }
  try {
    const result = await bridge.getPlayerDetails(req.params.username);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to get player details" });
  }
});

router.post("/players/:username/teleport", requireRunning, async (req, res) => {
  if (!BRIDGE_USERNAME_REGEX.test(req.params.username)) {
    return res.status(400).json({ error: "Invalid username format" });
  }
  const { x, y, z } = req.body;
  if (x === undefined || y === undefined) {
    return res.status(400).json({ error: "x and y coordinates are required" });
  }
  if (typeof x !== "number" || typeof y !== "number" || (z !== undefined && typeof z !== "number")) {
    return res.status(400).json({ error: "Coordinates must be numbers" });
  }
  if (x < 0 || x > 24000 || y < 0 || y > 24000) {
    return res.status(400).json({ error: "x/y coordinates out of range (0-24000)" });
  }
  if (z !== undefined && (z < 0 || z > 8)) {
    return res.status(400).json({ error: "z coordinate out of range (0-8)" });
  }
  try {
    const result = await bridge.teleportPlayer(req.params.username, x, y, z);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Teleport failed" });
  }
});

// ============================================
// PLAYER ADMIN CONTROLS
// ============================================

// Give item to player
router.post("/players/:username/give-item", requireRunningShort, async (req, res) => {
  const { username } = req.params;
  if (!BRIDGE_USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: "Invalid username format" });
  }
  const { itemType, count = 1 } = req.body;
  if (
    !itemType ||
    typeof itemType !== "string" ||
    !/^[a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*$/.test(itemType)
  ) {
    return res.status(400).json({
      error: 'itemType must be in Module.ItemName format (e.g., "Base.Axe")',
    });
  }
  if (typeof count !== "number" || count < 1 || count > 100) {
    return res.status(400).json({ error: "count must be 1-100" });
  }
  try {
    const result = await bridge.sendCommand("giveItem", { username, itemType, count });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Heal player
router.post("/players/:username/heal", requireRunningShort, async (req, res) => {
  const { username } = req.params;
  if (!BRIDGE_USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: "Invalid username format" });
  }
  try {
    const result = await bridge.sendCommand("healPlayer", { username });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Kill player
router.post("/players/:username/kill", requireRunningShort, async (req, res) => {
  const { username } = req.params;
  if (!BRIDGE_USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: "Invalid username format" });
  }
  try {
    const result = await bridge.sendCommand("killPlayer", { username });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Set god mode for player
router.post("/players/:username/godmode", requireRunningShort, async (req, res) => {
  const { username } = req.params;
  if (!BRIDGE_USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: "Invalid username format" });
  }
  const { enabled } = req.body;
  try {
    const result = await bridge.sendCommand("setGodMode", { username, enabled: enabled === true });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Set invisible for player
router.post("/players/:username/invisible", requireRunningShort, async (req, res) => {
  const { username } = req.params;
  if (!BRIDGE_USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: "Invalid username format" });
  }
  const { enabled } = req.body;
  try {
    const result = await bridge.sendCommand("setInvisible", { username, enabled: enabled === true });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
