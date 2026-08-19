import express from "express";
import { createLogger } from "../../utils/logger.js";
import {
  sanitizeError,
  sanitizeServerResponse,
  isMaskedSecret,
} from "../../utils/sanitize.js";
import { normalizeRconHost } from "../../services/rcon.js";
import { getServer, updateServer, deleteServer } from "../../database/init.js";
import {
  normalizeMemoryGb,
  parseServerId,
  isValidServerName,
} from "./shared.js";

const log = createLogger("API:Servers");
const router = express.Router();

// Get a specific server
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: "Invalid server ID" });
    }
    const serverId = parseServerId(id);

    const server = await getServer(serverId);
    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }

    res.json({ server: sanitizeServerResponse(server) });
  } catch (error) {
    log.error(`Failed to get server: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Allowed fields for server update — prevents mass assignment of internal fields (id, isActive, etc.)
const ALLOWED_SERVER_UPDATE_FIELDS = [
  "name",
  "serverName",
  "installPath",
  "serverPath",
  "zomboidDataPath",
  "serverConfigPath",
  "branch",
  "rconHost",
  "rconPort",
  "rconPassword",
  "serverPort",
  "minMemory",
  "maxMemory",
  "useNoSteam",
  "useDebug",
  "isRemote",
  "startBat",
  "batFile",
  "description",
  "adminPassword",
];

// Update a server
router.put("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: "Invalid server ID" });
    }
    const serverId = parseServerId(id);

    // Only allow whitelisted fields — block id, isActive, created, etc.
    const updates = {};
    for (const key of ALLOWED_SERVER_UPDATE_FIELDS) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    // Validate serverName against path traversal — this field is
    // interpolated into filesystem paths downstream (server-files, backups,
    // chunks), so it must pass the same check as server creation.
    if (updates.serverName !== undefined) {
      const trimmed = String(updates.serverName).trim();
      if (!isValidServerName(trimmed)) {
        return res.status(400).json({
          error:
            "Invalid server name: only letters, numbers, underscores, hyphens and spaces allowed",
        });
      }
      updates.serverName = trimmed;
    }

    // GET responses mask rconPassword/adminPassword (sanitizeServerResponse).
    // If the client echoes that masked value back unmodified, drop the field
    // so the real stored secret isn't overwritten with bullets.
    for (const key of ["rconPassword", "adminPassword"]) {
      if (updates[key] !== undefined && isMaskedSecret(updates[key])) {
        delete updates[key];
      }
    }

    if (updates.rconHost !== undefined) {
      updates.rconHost = normalizeRconHost(updates.rconHost);
    }

    // Validate RCON port if provided
    if (updates.rconPort !== undefined) {
      const rconPort = parseInt(updates.rconPort, 10);
      if (isNaN(rconPort) || rconPort < 1 || rconPort > 65535) {
        return res.status(400).json({ error: "Invalid RCON port" });
      }
      updates.rconPort = rconPort;
    }

    // Validate server port if provided
    if (updates.serverPort !== undefined) {
      const serverPort = parseInt(updates.serverPort, 10);
      if (isNaN(serverPort) || serverPort < 1 || serverPort > 65535) {
        return res.status(400).json({ error: "Invalid server port" });
      }
      updates.serverPort = serverPort;
    }

    // Parse numeric fields
    if (updates.minMemory !== undefined) {
      updates.minMemory = normalizeMemoryGb(updates.minMemory, 4);
    }
    if (updates.maxMemory !== undefined) {
      updates.maxMemory = normalizeMemoryGb(updates.maxMemory, 8);
    }

    // Parse boolean fields
    if (updates.useNoSteam !== undefined) {
      updates.useNoSteam = !!updates.useNoSteam;
    }
    if (updates.useDebug !== undefined) {
      updates.useDebug = !!updates.useDebug;
    }

    const server = await updateServer(serverId, updates);
    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }

    log.info(`Updated server: ${server.name} (ID: ${server.id})`);

    // If the active server's RCON settings changed, refresh the RCON service
    // Otherwise the service keeps stale cached credentials after a reconnect
    if (server.isActive) {
      const rconFieldsChanged = ["rconHost", "rconPort", "rconPassword"].some(
        (k) => Object.prototype.hasOwnProperty.call(updates, k),
      );
      const serverManagerFieldsChanged = [
        "installPath",
        "serverPath",
        "zomboidDataPath",
        "serverConfigPath",
        "branch",
        "serverPort",
        "minMemory",
        "maxMemory",
        "useNoSteam",
        "useDebug",
        "startBat",
        "batFile",
        "serverName",
      ].some((k) => Object.prototype.hasOwnProperty.call(updates, k));

      const rconService = req.app.get("rconService");
      const serverManager = req.app.get("serverManager");

      if (serverManagerFieldsChanged && serverManager?.reloadConfig) {
        try {
          await serverManager.reloadConfig();
          log.info(`ServerManager config refreshed after active server update`);
        } catch (e) {
          log.warn(`ServerManager reload failed after update: ${e.message}`);
        }
      }

      if (rconFieldsChanged && rconService?.reloadConfig) {
        try {
          if (rconService.isConnected && rconService.isConnected()) {
            await rconService.disconnect();
          }
          await rconService.reloadConfig();
          // Try to reconnect in background; auto-reconnect will also keep trying
          rconService.connect().catch(() => {});
          log.info(`RCON config refreshed after active server update`);
        } catch (e) {
          log.warn(`RCON reload failed after update: ${e.message}`);
        }
      }
    }

    res.json({
      server: sanitizeServerResponse(server),
      message: "Server updated successfully",
    });
  } catch (error) {
    log.error(`Failed to update server: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Delete a server
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: "Invalid server ID" });
    }
    const serverId = parseServerId(id);

    const success = await deleteServer(serverId);
    if (!success) {
      return res.status(404).json({ error: "Server not found" });
    }

    // Notify all clients so sidebar refreshes
    const io = req.app.get("io");
    if (io) {
      io.emit("activeServerChanged", { deleted: serverId });
    }

    log.info(`Deleted server ID: ${serverId}`);
    res.json({ success: true, message: "Server deleted successfully" });
  } catch (error) {
    log.error(`Failed to delete server: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
