import express from "express";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { setActiveServer } from "../../database/init.js";
import { parseServerId } from "./shared.js";

const log = createLogger("API:Servers");
const router = express.Router();

// Set active server
router.post("/:id/activate", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: "Invalid server ID" });
    }
    const serverId = parseServerId(id);

    const server = await setActiveServer(serverId);
    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }

    // Notify services about the active server change
    const rconService = req.app.get("rconService");
    const serverManager = req.app.get("serverManager");
    const io = req.app.get("io");

    // Reload ServerManager config for new active server
    if (serverManager && serverManager.reloadConfig) {
      await serverManager.reloadConfig();
      log.info(`ServerManager reloaded config for server: ${server.name}`);
    }

    // Disconnect current RCON if connected
    if (rconService && rconService.isConnected()) {
      await rconService.disconnect();
    }

    // Reload RCON config and reconnect with new server's settings
    if (rconService && server.rconPassword) {
      try {
        await rconService.reloadConfig();
        await rconService.connect();
        log.info(`RCON reconnected for server: ${server.name}`);
      } catch (rconErr) {
        log.warn(`Failed to connect RCON for new server: ${rconErr.message}`);
      }
    }

    // Emit to clients that active server changed
    if (io) {
      io.emit("activeServerChanged", { server });
    }

    log.info(`Activated server: ${server.name} (ID: ${server.id})`);
    res.json({ server, message: `Now managing: ${server.name}` });
  } catch (error) {
    log.error(`Failed to activate server: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
