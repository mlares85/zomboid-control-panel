/**
 * World state: game time, world stats/save, sandbox options (read-only),
 * server chat broadcast, and power/water utilities.
 */

import express from "express";
import bridge from "../../services/panelBridge.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { persistSandboxValues } from "../serverFiles.js";
import { createLogger } from "../../utils/logger.js";
import { requireBridgeRunning } from "../../middleware/panelBridgeGuards.js";

const log = createLogger("API:PanelBridge");
const router = express.Router();
const requireRunning = requireBridgeRunning();

// Game time endpoints
router.get("/time", requireRunning, async (req, res) => {
  try {
    const result = await bridge.getGameTime();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/time", requireRunning, async (req, res) => {
  const { hour, day, month, year } = req.body;
  if (
    hour !== undefined &&
    (typeof hour !== "number" || !Number.isInteger(hour) || hour < 0 || hour > 23)
  ) {
    return res.status(400).json({ error: "hour must be an integer 0-23" });
  }
  if (
    day !== undefined &&
    (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 31)
  ) {
    return res.status(400).json({ error: "day must be an integer 1-31" });
  }
  if (
    month !== undefined &&
    (typeof month !== "number" || !Number.isInteger(month) || month < 1 || month > 12)
  ) {
    return res.status(400).json({ error: "month must be an integer 1-12" });
  }
  if (
    year !== undefined &&
    (typeof year !== "number" || !Number.isInteger(year) || year < 1 || year > 9999)
  ) {
    return res.status(400).json({ error: "year must be an integer 1-9999" });
  }
  try {
    const result = await bridge.setGameTime({ hour, day, month, year });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// World stats
router.get("/world/stats", requireRunning, async (req, res) => {
  try {
    const result = await bridge.getWorldStats();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Save world
router.post("/world/save", requireRunning, async (req, res) => {
  try {
    const result = await bridge.saveWorld();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Server message (routed via sendToServerChat; no dedicated sendServerMessage Lua handler)
router.post("/message", requireRunning, async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== "string" || message.length > 2000) {
    return res.status(400).json({ error: "message is required (max 2000 chars)" });
  }
  try {
    const result = await bridge.sendCommand("sendToServerChat", {
      message,
      isAlert: true,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Sandbox options (read-only)
router.get("/sandbox", requireRunning, async (req, res) => {
  try {
    const result = await bridge.getSandboxOptions();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// =============================================
// V1.4.0 INFRASTRUCTURE (POWER/WATER) ENDPOINTS
// =============================================

// The bridge only moves SandboxOptions in memory, so mirror the same values
// into SandboxVars.lua or the next server start silently undoes the change.
// 9 = "Disabled"/never shuts off, 1 = "Instant"; the modifier is what the game
// actually compares world age against.
async function persistUtilities(power, water, on) {
  const values = {};
  if (power) {
    values.ElecShut = on ? 9 : 1;
    values.ElecShutModifier = on ? 2147483647 : 0;
  }
  if (water) {
    values.WaterShut = on ? 9 : 1;
    values.WaterShutModifier = on ? 2147483647 : 0;
  }
  try {
    const { persisted, reason } = await persistSandboxValues(values);
    if (!persisted) {
      log.warn(`Utilities not persisted to SandboxVars.lua: ${reason}`);
    }
    return { persisted, persistReason: reason };
  } catch (error) {
    log.error(`Failed to persist utilities to SandboxVars.lua: ${error.message}`);
    return { persisted: false, persistReason: sanitizeError(error.message) };
  }
}

// Get utilities (power/water) status
router.get("/utilities/status", requireRunning, async (req, res) => {
  try {
    const result = await bridge.sendCommand("getUtilitiesStatus", {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Restore utilities (turn power/water back on)
router.post("/utilities/restore", requireRunning, async (req, res) => {
  const { power, water } = req.body;
  log.info(`Restoring utilities - power: ${power !== false}, water: ${water !== false}`);
  try {
    const result = await bridge.sendCommand("restoreUtilities", {
      power: power !== false,
      water: water !== false,
    });
    log.info(`Utilities restored successfully`, result?.debug ? { debug: result.debug } : {});
    res.json({
      ...result,
      ...(await persistUtilities(power !== false, water !== false, true)),
    });
  } catch (error) {
    log.error(`Failed to restore utilities: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Shut off utilities
router.post("/utilities/shutoff", requireRunning, async (req, res) => {
  const { power, water } = req.body;
  log.info(`Shutting off utilities - power: ${power !== false}, water: ${water !== false}`);
  try {
    const result = await bridge.sendCommand("shutOffUtilities", {
      power: power !== false,
      water: water !== false,
    });
    log.info(`Utilities shut off successfully`, result?.debug ? { debug: result.debug } : {});
    res.json({
      ...result,
      ...(await persistUtilities(power !== false, water !== false, false)),
    });
  } catch (error) {
    log.error(`Failed to shut off utilities: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
