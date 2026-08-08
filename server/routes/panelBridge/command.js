/**
 * Generic PanelBridge command passthrough — every curated preset button in
 * the UI ultimately calls through here (or its own dedicated route), plus
 * this is the only way to reach handlers with no dedicated REST route.
 */

import express from "express";
import bridge from "../../services/panelBridge.js";
import { getActiveServer, logBridgeCommand } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { requireRole } from "../../services/auth.js";
import { createLogger } from "../../utils/logger.js";
import { VALID_ACTIONS } from "./commandActions.js";
import { commandCatalog } from "./commandCatalog.js";

const log = createLogger("API:PanelBridge");
const router = express.Router();

const ITEM_TYPE_REGEX = /^[A-Za-z0-9_]+\.[A-Za-z0-9_&#+.\-]+$/;
const VEHICLE_SCRIPT_REGEX = /^[A-Za-z0-9_]+\.[A-Za-z0-9_&#+.\-]+$/;

function validateAirdropArgs(args) {
  if (!args) return null;
  const VALID_PRESETS = ["military", "medical", "food", "building", "weapons", "tools"];
  const x = Number(args.x),
    y = Number(args.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 24000 || y < 0 || y > 24000) {
    return "Invalid airdrop coordinates (valid: 0-24000)";
  }
  if (args.preset && (typeof args.preset !== "string" || !VALID_PRESETS.includes(args.preset))) {
    return `Invalid preset. Valid: ${VALID_PRESETS.join(", ")}`;
  }
  if (args.items && (!Array.isArray(args.items) || args.items.length > 50)) {
    return "items must be an array with at most 50 entries";
  }
  if (Array.isArray(args.items)) {
    for (const entry of args.items) {
      if (!entry || typeof entry !== "object") {
        return "Each item must be an object with itemType";
      }
      if (typeof entry.itemType !== "string" || !ITEM_TYPE_REGEX.test(entry.itemType)) {
        return `Invalid item type format: ${String(entry.itemType).slice(0, 60)}`;
      }
      if (entry.count !== undefined && (typeof entry.count !== "number" || entry.count < 1 || entry.count > 20)) {
        return "Item count must be 1-20";
      }
    }
  }
  return null;
}

// Build 42 does not expose a Lua vehicle-spawn API. The RCON command is
// the supported server path and returns its result directly to the map.
async function handleSpawnVehicleAt(req, res, args) {
  const vehicle = args?.vehicle ?? args?.scriptName;
  const x = Number(args?.x);
  const y = Number(args?.y);
  const z = Number(args?.z ?? 0);
  if (typeof vehicle !== "string" || !VEHICLE_SCRIPT_REGEX.test(vehicle)) {
    return res.status(400).json({ error: "Invalid vehicle script name" });
  }
  if (
    !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) ||
    x < 0 || x > 24000 || y < 0 || y > 24000 || z < 0 || z > 8 ||
    (x === 0 && y === 0)
  ) {
    return res.status(400).json({ error: "Invalid coordinates (x/y: 0-24000, z: 0-8)" });
  }

  try {
    const result = await req.app.get("rconService").addVehicleAt(vehicle, x, y, z);
    logBridgeCommand("spawnVehicleAt", args, result, result.success, 0).catch(() => {});
    return res.json({
      ...result,
      data: result.success ? {
        message: "Vehicle spawn requested",
        scriptName: vehicle,
        x: Math.floor(x),
        y: Math.floor(y),
        z: Math.floor(z),
      } : undefined,
    });
  } catch (error) {
    const message = sanitizeError(error?.message || "Vehicle spawn failed");
    logBridgeCommand("spawnVehicleAt", args, { error: message }, false, 0).catch(() => {});
    return res.status(500).json({ success: false, error: message });
  }
}

function categorizeCommandError(res, message) {
  if (/timeout/i.test(message)) {
    return res.status(504).json({ error: message, category: "timeout" });
  }
  if (/not configured|not running|unhealthy|not responding|stale|missing/i.test(message)) {
    return res.status(503).json({ error: message, category: "bridge-unavailable" });
  }
  if (/invalid|required/i.test(message)) {
    return res.status(400).json({ error: message, category: "validation" });
  }
  return res.status(500).json({ error: message, category: "unknown" });
}

// Send a command to the game. Admin-gated for consistency with the other
// powerful/destructive routes (backup restore, chunk deletion, server wipe)
// — this is the generic passthrough for ANY PanelBridge handler (teleport,
// giveItem, character import/export, horde spawning, etc.), not just the
// curated preset buttons in the Events UI. Every account is currently
// created as 'admin' (see auth.js), so this has no effect today, but keeps
// the route safe if a lower-privilege role is ever introduced.
router.post("/command", requireRole("admin"), async (req, res) => {
  const activeServer = await getActiveServer();
  if (activeServer?.isRemote && !bridge.isSftpRunning() && !bridge.isRunning) {
    return res.status(400).json({
      error:
        "PanelBridge requires a configured mapped drive or a running SFTP bridge transport for remote servers.",
    });
  }

  const { action, args } = req.body;

  if (!action) {
    return res.status(400).json({ error: "action is required" });
  }

  // Validate action against whitelist
  if (typeof action !== "string" || !VALID_ACTIONS.has(action)) {
    return res.status(400).json({ error: "Unknown or invalid action" });
  }

  // Validate args if provided
  if (args !== undefined && (typeof args !== "object" || args === null || Array.isArray(args))) {
    return res.status(400).json({ error: "args must be an object" });
  }

  if (action === "spawnVehicleAt") {
    return handleSpawnVehicleAt(req, res, args);
  }

  if (!bridge.bridgePath) {
    return res.status(400).json({ error: "Bridge not configured" });
  }

  if (!bridge.isRunning) {
    return res.status(400).json({ error: "Bridge not running. Start it first." });
  }

  // Action-specific validation
  if (action === "airdrop") {
    const airdropError = validateAirdropArgs(args);
    if (airdropError) return res.status(400).json({ error: airdropError });
  }

  const startTime = Date.now();
  try {
    log.info(
      `POST /command: action=${action} args=${JSON.stringify(args || {}).substring(0, 200)}`,
    );
    const result = await bridge.sendCommand(action, args || {});
    const durationMs = Date.now() - startTime;
    log.debug(`POST /command: action=${action} completed in ${durationMs}ms`);
    logBridgeCommand(action, args, result, true, durationMs).catch(() => {});
    res.json(result);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const message = sanitizeError(error?.message || "Bridge command failed");
    logBridgeCommand(action, args, { error: message }, false, durationMs).catch(() => {});
    categorizeCommandError(res, message);
  }
});

// Get available commands (complete reference for all Lua handlers)
router.get("/commands", (req, res) => {
  res.json(commandCatalog);
});

export default router;
