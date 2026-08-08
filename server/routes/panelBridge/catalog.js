/**
 * Item/vehicle catalog: cached read endpoints backed by the db, plus
 * PanelBridge-driven scans that (re)populate the cache.
 */

import express from "express";
import bridge from "../../services/panelBridge.js";
import { getDb, commitNow } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { createLogger } from "../../utils/logger.js";
import { requireBridgeRunning } from "../../middleware/panelBridgeGuards.js";

const log = createLogger("API:PanelBridge");
const router = express.Router();

// Get cached item catalog
router.get("/catalog/items", async (req, res) => {
  try {
    const db = await getDb();
    const catalog = db.data.itemCatalog || null;
    if (!catalog) {
      return res.json({ items: [], count: 0, scannedAt: null });
    }
    res.json(catalog);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Get cached vehicle catalog
router.get("/catalog/vehicles", async (req, res) => {
  try {
    const db = await getDb();
    const catalog = db.data.vehicleCatalog || null;
    if (!catalog) {
      return res.json({ vehicles: [], count: 0, scannedAt: null });
    }
    res.json(catalog);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Scan items from running server via PanelBridge, cache result
router.post(
  "/catalog/scan-items",
  requireBridgeRunning("Bridge not running — server must be online to scan items"),
  async (req, res) => {
    try {
      log.info("Scanning item catalog via PanelBridge...");
      const result = await bridge.sendCommand("getItemCatalog", {});
      if (!result || !result.success) {
        return res.status(500).json({ error: result?.error || "Item scan failed" });
      }
      const catalog = {
        items: result.data?.items || [],
        count: result.data?.count || 0,
        scannedAt: new Date().toISOString(),
      };
      const db = await getDb();
      db.data.itemCatalog = catalog;
      await commitNow();
      log.info(`Item catalog cached: ${catalog.count} items`);
      res.json(catalog);
    } catch (error) {
      log.error("Item catalog scan failed:", error.message);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  },
);

// Scan vehicles from running server via PanelBridge, cache result
router.post(
  "/catalog/scan-vehicles",
  requireBridgeRunning("Bridge not running — server must be online to scan vehicles"),
  async (req, res) => {
    try {
      log.info("Scanning vehicle catalog via PanelBridge...");
      const result = await bridge.sendCommand("getVehicleCatalog", {});
      if (!result || !result.success) {
        return res.status(500).json({ error: result?.error || "Vehicle scan failed" });
      }
      const catalog = {
        vehicles: result.data?.vehicles || [],
        count: result.data?.count || 0,
        scannedAt: new Date().toISOString(),
      };
      const db = await getDb();
      db.data.vehicleCatalog = catalog;
      await commitNow();
      log.info(`Vehicle catalog cached: ${catalog.count} vehicles`);
      res.json(catalog);
    } catch (error) {
      log.error("Vehicle catalog scan failed:", error.message);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  },
);

// Debug: probe item script methods to find working category API
router.post(
  "/catalog/debug-item-script",
  requireBridgeRunning("Bridge not running"),
  async (req, res) => {
    try {
      const result = await bridge.sendCommand("debugItemScript", {});
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  },
);

export default router;
