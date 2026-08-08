import express from "express";
import path from "path";
import { createLogger } from "../../utils/logger.js";
import { getActiveServer } from "../../database/init.js";
import { listPersistedVehicles } from "../../utils/vehiclesDb.js";

const log = createLogger("API:MapProxy");
const router = express.Router();

let persistedVehicleCache = { key: null, expiresAt: 0, vehicles: [] };

router.get("/vehicles", async (req, res) => {
  try {
    const activeServer = await getActiveServer();
    if (!activeServer || activeServer.isRemote || !activeServer.zomboidDataPath) {
      return res.json({ vehicles: [] });
    }
    const serverName = activeServer.serverName || activeServer.name;
    if (!serverName) return res.json({ vehicles: [] });
    const savePath = path.join(activeServer.zomboidDataPath, "Saves", "Multiplayer", serverName);
    const cacheKey = `${savePath}`;
    if (persistedVehicleCache.key !== cacheKey || Date.now() >= persistedVehicleCache.expiresAt) {
      persistedVehicleCache = {
        key: cacheKey,
        expiresAt: Date.now() + 15000,
        vehicles: await listPersistedVehicles(savePath),
      };
    }
    res.json({ vehicles: persistedVehicleCache.vehicles });
  } catch (err) {
    log.warn(`Persisted vehicle lookup failed: ${err.message}`);
    res.json({ vehicles: [] });
  }
});

export default router;
