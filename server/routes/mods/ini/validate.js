import express from "express";
import path from "path";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import { getServerConfigPath, getServerName, getServerPath } from "../../../utils/mods/serverConfig.js";
import { readTextFile } from "../../../utils/mods/iniFile.js";
import { getModDetailsFromWorkshop } from "../../../utils/mods/workshopModInfo.js";
import { LocalFiles } from "../../../services/fileAccess/index.js";

const log = createLogger("API:Mods");
const router = express.Router();

// Validate mod configuration (check for dependencies and consistency)
router.get("/validate-config", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const serverConfigPath = await getServerConfigPath();
    const serverPath = await getServerPath();
    const serverName = await getServerName();

    if (!serverConfigPath) {
      return res.status(400).json({ error: "Server config path not set" });
    }

    // Sanitize serverName
    const sanitizedServerName = path.basename(serverName);
    if (
      !sanitizedServerName ||
      sanitizedServerName !== serverName ||
      serverName.includes("..")
    ) {
      return res.status(400).json({ error: "Invalid server name" });
    }
    const iniPath = path.join(serverConfigPath, `${sanitizedServerName}.ini`);

    if (!(await fileAccess.exists(iniPath))) {
      return res.status(400).json({ error: "Server config file not found" });
    }

    const content = readTextFile(iniPath);
    const workshopMatch = content.match(/^WorkshopItems=(.*)$/m);
    const modsMatch = content.match(/^Mods=(.*)$/m);

    const workshopIds = workshopMatch
      ? workshopMatch[1].split(";").filter(Boolean)
      : [];
    const modIds = modsMatch ? modsMatch[1].split(";").filter(Boolean) : [];

    const warnings = [];
    const errors = [];

    // 1. Check for Orphaned Mod IDs (Mods in list but no corresponding Workshop Item)
    // This requires scanning all configured workshop items to see what mods they provide
    const availableModIds = new Set();
    const modIdToWorkshopId = new Map();
    const references = new Map(); // modId -> { require: [] }

    if (serverPath) {
      for (const wid of workshopIds) {
        const details = getModDetailsFromWorkshop(wid, serverPath);
        for (const mod of details) {
          availableModIds.add(mod.id);
          modIdToWorkshopId.set(mod.id, wid);
          if (mod.require) {
            references.set(mod.id, mod.require);
          }
        }
      }

      // Check if enabled mods exist in enabled workshop items
      for (const mid of modIds) {
        if (!availableModIds.has(mid)) {
          // It might be a default game map/mod, or truly missing
          // PZ default mods don't come from workshop
          if (mid !== "example") {
            // Filter out common testing strings
            warnings.push({
              type: "missing_source",
              modId: mid,
              message: `Mod ID '${mid}' is enabled but not found in any configured Workshop Item.`,
            });
          }
        }
      }

      // 2. Check for Missing Dependencies
      for (const mid of modIds) {
        const requirements = references.get(mid);
        if (requirements) {
          for (const req of requirements) {
            if (!modIds.includes(req)) {
              // Check if it's a base game mod (unlikely to be missing but possible)
              errors.push({
                type: "missing_dependency",
                modId: mid,
                dependency: req,
                message: `Mod '${mid}' requires '${req}' but it is not enabled.`,
              });
            }
          }
        }
      }
    } else {
      warnings.push({
        type: "config",
        message: "Server path not configured - cannot validate files on disk.",
      });
    }

    res.json({
      valid: errors.length === 0,
      errors,
      warnings,
      stats: {
        workshopItems: workshopIds.length,
        enabledMods: modIds.length,
        availableMods: availableModIds.size,
      },
    });
  } catch (error) {
    log.error(`Failed to validate config: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
