/**
 * Weather control: storms/blizzards/rain/snow/lightning and the current
 * weather snapshot.
 */

import express from "express";
import bridge from "../../services/panelBridge.js";
import { sanitizeError } from "../../utils/sanitize.js";
import {
  requireBridgeConfigured,
  requireBridgeRunning,
} from "../../middleware/panelBridgeGuards.js";

const router = express.Router();
const requireRunning = requireBridgeRunning();

// Get weather info
router.get("/weather", requireBridgeConfigured, requireRunning, async (req, res) => {
  try {
    const result = await bridge.getWeather();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/weather/blizzard", requireRunning, async (req, res) => {
  const { duration } = req.body;
  try {
    const result = await bridge.triggerBlizzard(duration);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/weather/tropical-storm", requireRunning, async (req, res) => {
  const { duration } = req.body;
  try {
    const result = await bridge.triggerTropicalStorm(duration);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/weather/storm", requireRunning, async (req, res) => {
  const { duration } = req.body;
  if (
    duration !== undefined &&
    (typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      duration < 0 ||
      duration > 168)
  ) {
    return res
      .status(400)
      .json({ error: "duration must be a number 0-168 (hours)" });
  }
  try {
    const result = await bridge.triggerStorm(duration);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/weather/stop", requireRunning, async (req, res) => {
  try {
    const result = await bridge.stopWeather();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Generate weather period
router.post("/weather/generate", requireRunning, async (req, res) => {
  const { strength, frontType } = req.body;
  if (
    strength !== undefined &&
    (typeof strength !== "number" ||
      !Number.isFinite(strength) ||
      strength < 0 ||
      strength > 1)
  ) {
    return res.status(400).json({ error: "strength must be a number 0-1" });
  }
  if (
    frontType !== undefined &&
    (typeof frontType !== "number" ||
      !Number.isInteger(frontType) ||
      frontType < 0 ||
      frontType > 5)
  ) {
    return res.status(400).json({ error: "frontType must be an integer 0-5" });
  }
  try {
    const result = await bridge.generateWeather(strength ?? 0.5, frontType ?? 0);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/weather/snow", requireRunning, async (req, res) => {
  const { enabled, intensity } = req.body;
  if (
    intensity !== undefined &&
    intensity !== null &&
    (typeof intensity !== "number" ||
      !Number.isFinite(intensity) ||
      intensity < 0 ||
      intensity > 1)
  ) {
    return res.status(400).json({ error: "intensity must be a number 0-1" });
  }
  try {
    const result = await bridge.setSnow(enabled !== false, intensity ?? null);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Rain control
router.post("/weather/rain/start", requireRunning, async (req, res) => {
  const { intensity } = req.body;
  if (
    intensity !== undefined &&
    (typeof intensity !== "number" ||
      !Number.isFinite(intensity) ||
      intensity < 0 ||
      intensity > 1)
  ) {
    return res.status(400).json({ error: "intensity must be a number 0-1" });
  }
  try {
    const result = await bridge.startRain(intensity ?? 0.5);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/weather/rain/stop", requireRunning, async (req, res) => {
  try {
    const result = await bridge.stopRain();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Lightning
router.post("/weather/lightning", requireRunning, async (req, res) => {
  const { x, y, strike, light, rumble } = req.body;
  if (x !== undefined && (typeof x !== "number" || !Number.isFinite(x))) {
    return res.status(400).json({ error: "x must be a number" });
  }
  if (y !== undefined && (typeof y !== "number" || !Number.isFinite(y))) {
    return res.status(400).json({ error: "y must be a number" });
  }
  try {
    const result = await bridge.triggerLightning(x, y, strike, light, rumble);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
