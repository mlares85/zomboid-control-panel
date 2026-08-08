import express from "express";
import { createLogger } from "../../../utils/logger.js";
import {
  getIgnoredMods,
  removeIgnoredMod,
  clearAllIgnoredMods,
  getIgnoredModPairs,
  addIgnoredModPair,
  removeIgnoredModPair,
} from "../../../database/init.js";
import { sanitizeError } from "../../../utils/sanitize.js";

const log = createLogger("API:Mods");
const router = express.Router();

// ============================================
// Ignored Mods Management
// ============================================

// Get all ignored mods for the active server
router.get("/ignored", async (req, res) => {
  try {
    const ignored = await getIgnoredMods();
    res.json(ignored);
  } catch (error) {
    log.error(`Failed to get ignored mods: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Un-ignore a mod (allow it to be tracked again)
router.delete("/ignored/:workshopId", async (req, res) => {
  try {
    const { workshopId } = req.params;
    if (!workshopId || !/^\d{1,15}$/.test(workshopId)) {
      return res.status(400).json({ error: "Invalid workshop ID" });
    }
    const removed = await removeIgnoredMod(workshopId);
    if (!removed) {
      return res.status(404).json({ error: "Mod not found in ignore list" });
    }
    res.json({ success: true, message: "Mod removed from ignore list" });
  } catch (error) {
    log.error(`Failed to un-ignore mod: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Clear all ignored mods for the active server
router.delete("/ignored", async (req, res) => {
  try {
    const removed = await clearAllIgnoredMods();
    res.json({
      success: true,
      message: `Cleared ${removed} ignored mod${removed !== 1 ? "s" : ""}`,
      removed,
    });
  } catch (error) {
    log.error(`Failed to clear ignored mods: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// ============================================
// Ignored mod-conflict pairs (false positives on the variant detector)
// ============================================

const MOD_ID_RE = /^[A-Za-z0-9_.\-+ ()]{1,128}$/;

router.get("/ignored-pairs", async (req, res) => {
  try {
    const pairs = await getIgnoredModPairs();
    res.json(pairs);
  } catch (error) {
    log.error(`Failed to get ignored mod pairs: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/ignored-pairs", async (req, res) => {
  try {
    const { modIdA, modIdB, reason } = req.body || {};
    if (
      typeof modIdA !== "string" ||
      typeof modIdB !== "string" ||
      !MOD_ID_RE.test(modIdA) ||
      !MOD_ID_RE.test(modIdB)
    ) {
      return res.status(400).json({
        error: "modIdA and modIdB are required and must be valid mod IDs",
      });
    }
    if (modIdA === modIdB) {
      return res.status(400).json({ error: "modIdA and modIdB must differ" });
    }
    const safeReason = typeof reason === "string" ? reason.slice(0, 200) : null;
    const entry = await addIgnoredModPair(modIdA, modIdB, safeReason);
    if (!entry) return res.status(400).json({ error: "Invalid pair" });
    res.json({ success: true, pair: entry });
  } catch (error) {
    log.error(`Failed to add ignored mod pair: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.delete("/ignored-pairs", async (req, res) => {
  try {
    const { modIdA, modIdB } = req.body || {};
    if (
      typeof modIdA !== "string" ||
      typeof modIdB !== "string" ||
      !MOD_ID_RE.test(modIdA) ||
      !MOD_ID_RE.test(modIdB)
    ) {
      return res.status(400).json({ error: "modIdA and modIdB are required" });
    }
    const removed = await removeIgnoredModPair(modIdA, modIdB);
    if (!removed)
      return res.status(404).json({ error: "Pair not found in ignore list" });
    res.json({ success: true });
  } catch (error) {
    log.error(`Failed to remove ignored mod pair: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
