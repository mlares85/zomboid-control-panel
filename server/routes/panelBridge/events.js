/**
 * World-event bridge commands that don't fit an existing domain file yet
 * (helicopter, and future AI Director one-off events).
 */

import express from "express";
import bridge from "../../services/panelBridge.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { requireBridgeRunning } from "../../middleware/panelBridgeGuards.js";

const router = express.Router();
const requireRunning = requireBridgeRunning();

// Stop an active helicopter event
router.post("/events/helicopter/stop", requireRunning, async (req, res) => {
  try {
    const result = await bridge.stopHelicopterEvent();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
