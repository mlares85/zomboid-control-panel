/**
 * Mod debug endpoints: log tail, stats, verbose-mode toggle, API probing,
 * handler enumeration, error clearing.
 */

import express from "express";
import bridge from "../../services/panelBridge.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { requireBridgeRunning } from "../../middleware/panelBridgeGuards.js";

const router = express.Router();
const requireRunning = requireBridgeRunning("Bridge not running");

// Get mod debug log
router.get("/debug/log", requireRunning, async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
  const VALID_LOG_LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"];
  const minLevel = VALID_LOG_LEVELS.includes(req.query.level) ? req.query.level : "DEBUG";
  try {
    const result = await bridge.sendCommand("getDebugLog", { limit, minLevel });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Get mod statistics
router.get("/debug/stats", requireRunning, async (req, res) => {
  try {
    const result = await bridge.sendCommand("getStats", {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Set debug mode
router.post("/debug/mode", requireRunning, async (req, res) => {
  const { enabled } = req.body;
  try {
    const result = await bridge.sendCommand("setDebugMode", { enabled: enabled === true });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Check API availability
router.get("/debug/api", requireRunning, async (req, res) => {
  const { object, method } = req.query;
  // Validate as identifier-like strings
  if (object && (typeof object !== "string" || !/^[a-zA-Z0-9_.]{1,100}$/.test(object))) {
    return res.status(400).json({ error: "Invalid object name" });
  }
  if (method && (typeof method !== "string" || !/^[a-zA-Z0-9_.]{1,100}$/.test(method))) {
    return res.status(400).json({ error: "Invalid method name" });
  }
  try {
    const result = await bridge.sendCommand("checkAPI", { object, method });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Get available handlers
router.get("/debug/handlers", requireRunning, async (req, res) => {
  try {
    const result = await bridge.sendCommand("getAvailableHandlers", {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Clear mod errors
router.post("/debug/clear-errors", requireRunning, async (req, res) => {
  try {
    const result = await bridge.clearErrors();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
