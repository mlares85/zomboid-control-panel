/**
 * Climate float overrides (temperature/wind/fog/clouds/etc.) and the
 * related visual-lighting shortcuts (daylight, night strength, ambient...).
 */

import express from "express";
import bridge from "../../services/panelBridge.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { requireBridgeRunning } from "../../middleware/panelBridgeGuards.js";

const router = express.Router();
const requireRunning = requireBridgeRunning();
const requireRunningShort = requireBridgeRunning("Bridge not running");

// Climate float control
router.get("/climate/floats", requireRunning, async (req, res) => {
  try {
    const result = await bridge.getClimateFloats();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/climate/float", requireRunning, async (req, res) => {
  const { floatId, value, enable } = req.body;
  if (floatId === undefined || value === undefined) {
    return res.status(400).json({ error: "floatId and value are required" });
  }
  if (
    typeof floatId !== "number" ||
    !Number.isInteger(floatId) ||
    floatId < 0 ||
    floatId > 12
  ) {
    return res.status(400).json({ error: "floatId must be an integer 0-12" });
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return res.status(400).json({ error: "value must be a number" });
  }
  try {
    const result = await bridge.setClimateFloat(floatId, value, enable !== false);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/climate/reset", requireRunning, async (req, res) => {
  try {
    const result = await bridge.resetClimateOverrides();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Individual climate shortcuts
router.post("/climate/temperature", requireRunning, async (req, res) => {
  const { value } = req.body;
  if (
    value !== undefined &&
    (typeof value !== "number" || !Number.isFinite(value) || value < -50 || value > 50)
  ) {
    return res.status(400).json({ error: "value must be a number -50 to 50" });
  }
  try {
    const result = await bridge.setTemperature(value ?? 22);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/climate/wind", requireRunning, async (req, res) => {
  const { value } = req.body;
  if (
    value !== undefined &&
    (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
  ) {
    return res.status(400).json({ error: "value must be a number 0-1" });
  }
  try {
    const result = await bridge.setWind(value ?? 0.5);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/climate/fog", requireRunning, async (req, res) => {
  const { value } = req.body;
  if (
    value !== undefined &&
    (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
  ) {
    return res.status(400).json({ error: "value must be a number 0-1" });
  }
  try {
    const result = await bridge.setFog(value ?? 0);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/climate/clouds", requireRunning, async (req, res) => {
  const { value } = req.body;
  if (
    value !== undefined &&
    (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
  ) {
    return res.status(400).json({ error: "value must be a number 0-1" });
  }
  try {
    const result = await bridge.setClouds(value ?? 0);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// ============================================
// VISUAL EFFECTS CONTROLS
// ============================================

router.post("/visual/view-distance", requireRunningShort, async (req, res) => {
  const { value } = req.body;
  if (typeof value !== "number") {
    return res.status(400).json({ error: "value is required (number 0.0-1.0)" });
  }
  try {
    const result = await bridge.sendCommand("setViewDistance", { value });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/visual/daylight", requireRunningShort, async (req, res) => {
  const { value } = req.body;
  if (typeof value !== "number") {
    return res.status(400).json({ error: "value is required (0.0-1.0)" });
  }
  try {
    const result = await bridge.sendCommand("setDayLight", { value });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/visual/night-strength", requireRunningShort, async (req, res) => {
  const { value } = req.body;
  if (typeof value !== "number") {
    return res.status(400).json({ error: "value is required (0.0-1.0)" });
  }
  try {
    const result = await bridge.sendCommand("setNightStrength", { value });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/visual/desaturation", requireRunningShort, async (req, res) => {
  const { value } = req.body;
  if (typeof value !== "number") {
    return res.status(400).json({ error: "value is required (0.0-1.0)" });
  }
  try {
    const result = await bridge.sendCommand("setDesaturation", { value });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/visual/ambient", requireRunningShort, async (req, res) => {
  const { value } = req.body;
  if (typeof value !== "number") {
    return res.status(400).json({ error: "value is required (0.0-1.0)" });
  }
  try {
    const result = await bridge.sendCommand("setAmbient", { value });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
