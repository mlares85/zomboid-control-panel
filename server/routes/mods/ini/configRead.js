import express from "express";
import fs from "fs";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import { getServerConfigPath, getServerName, getServerPath, getSanitizedIniPath } from "../../../utils/mods/serverConfig.js";
import { readTextFile } from "../../../utils/mods/iniFile.js";
import { getModDetailsFromWorkshop } from "../../../utils/mods/workshopModInfo.js";

const log = createLogger("API:Mods");
const router = express.Router();

// Get current mod configuration from .ini file
router.get("/current-config", async (req, res) => {
  try {
    const serverConfigPath = await getServerConfigPath();
    const serverName = await getServerName();

    if (!serverConfigPath) {
      return res.json({
        configured: false,
        error: "Server config path not set",
        modIds: [],
        workshopIds: [],
        totalMods: 0,
      });
    }

    const iniPath = getSanitizedIniPath(serverConfigPath, serverName);
    if (!iniPath) {
      return res.status(400).json({ error: "Invalid server name" });
    }

    if (!fs.existsSync(iniPath)) {
      return res.json({
        configured: false,
        error: "Server config file not found",
        modIds: [],
        workshopIds: [],
        totalMods: 0,
      });
    }

    const content = readTextFile(iniPath);

    // Extract mod-related settings
    const modsMatch = content.match(/^Mods=(.*)$/m);
    const workshopMatch = content.match(/^WorkshopItems=(.*)$/m);
    const mapMatch = content.match(/^Map=(.*)$/m);

    const modIds = modsMatch?.[1]?.split(";").filter(Boolean) || [];
    const workshopIds = workshopMatch?.[1]?.split(";").filter(Boolean) || [];
    const maps = mapMatch?.[1]?.split(";").filter(Boolean) || ["Muldraugh, KY"];

    // Build workshop → modId mapping from disk
    const serverPath = await getServerPath();
    const modIdSet = new Set(modIds);
    const workshopModMap = {}; // workshopId -> [{ id, name, enabled, require }]
    if (serverPath) {
      for (const wsId of workshopIds) {
        const details = getModDetailsFromWorkshop(wsId, serverPath);
        workshopModMap[wsId] = details.map((m) => ({
          id: m.id,
          name: m.name || m.id,
          enabled: modIdSet.has(m.id),
          require: m.require?.length ? m.require : undefined,
        }));
      }
    }

    res.json({
      configured: true,
      modIds,
      workshopIds,
      maps,
      totalMods: modIds.length,
      iniPath,
      workshopModMap,
    });
  } catch (error) {
    log.error(`Failed to get current mod config: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
