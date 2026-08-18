import express from "express";
import path from "path";
import { createLogger } from "../../../utils/logger.js";
import { LocalFiles } from "../../../services/fileAccess/index.js";
import { sanitizeError, sanitizeIniList, sanitizeModIdList, looksLikeWorkshopId } from "../../../utils/sanitize.js";
import { getServerConfigPath, getServerName, getServerPath } from "../../../utils/mods/serverConfig.js";
import { readTextFile, withIniLock } from "../../../utils/mods/iniFile.js";
import { findMapFoldersFromWorkshop } from "../../../utils/mods/workshopPaths.js";
import { findModIdFromWorkshop } from "../../../utils/mods/workshopModInfo.js";
import { fetchModIdFromWorkshop } from "../../../utils/mods/workshopFetch.js";

const log = createLogger("API:Mods");
const router = express.Router();

// Write mods to server .ini file
router.post("/write-to-ini", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const { mods, mapFolders } = req.body;
    log.info(
      `POST /write-to-ini: ${mods?.length || 0} mods, ${mapFolders?.length || 0} map folders`,
    );
    // mods: array of { workshopId, modId } where modId is the mod loading ID (from info.txt)
    // mapFolders: optional array of map folder names for map mods

    if (!mods || !Array.isArray(mods)) {
      return res.status(400).json({ error: "Mods array is required" });
    }

    // Validate all workshopId values are numeric to prevent path traversal
    for (const m of mods) {
      if (m.workshopId && !/^\d{1,15}$/.test(String(m.workshopId))) {
        return res.status(400).json({
          error: `Invalid Workshop ID: ${String(m.workshopId).substring(0, 20)}`,
        });
      }
    }

    const serverConfigPath = await getServerConfigPath();
    const serverName = await getServerName();
    const serverPath = await getServerPath();

    if (!serverConfigPath) {
      return res.status(400).json({
        error: "Server config path not set. Please configure the server first.",
      });
    }

    // Sanitize serverName to prevent path traversal
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
      return res.status(400).json({
        error:
          "Server config file not found. Start the server once first to generate the config file.",
      });
    }

    // Build the mod strings, auto-detecting mod IDs where possible
    // Mods= is semicolon-separated list of mod IDs (from mod's info.txt id= field)
    // WorkshopItems= is semicolon-separated list of Workshop IDs
    const resolvedMods = [];
    let autoDetectedCount = 0;

    for (const m of mods) {
      let modId = m.modId;
      const workshopIdStr = String(m.workshopId);

      // If modId looks like a workshop ID (all numeric), try to auto-detect the real mod ID
      if (modId && /^\d{1,15}$/.test(modId)) {
        // First try local files
        if (serverPath) {
          const detectedId = findModIdFromWorkshop(modId, serverPath);
          if (detectedId) {
            modId = detectedId;
            autoDetectedCount++;
            log.info(
              `Auto-detected mod ID from local files: ${detectedId} for workshop ${m.workshopId}`,
            );
          }
        }
        // If still numeric, try fetching from Steam Workshop page
        if (/^\d{1,15}$/.test(modId)) {
          const steamModId = await fetchModIdFromWorkshop(workshopIdStr);
          if (steamModId) {
            modId = steamModId;
            autoDetectedCount++;
            log.info(
              `Auto-detected mod ID from Steam Workshop: ${steamModId} for workshop ${m.workshopId}`,
            );
          }
        }
      }
      // Also try if no modId at all
      else if (!modId) {
        // First try local files
        if (serverPath) {
          const detectedId = findModIdFromWorkshop(workshopIdStr, serverPath);
          if (detectedId) {
            modId = detectedId;
            autoDetectedCount++;
            log.info(
              `Auto-detected mod ID from local files: ${detectedId} for workshop ${m.workshopId}`,
            );
          }
        }
        // If still no modId, try fetching from Steam Workshop page
        if (!modId) {
          const steamModId = await fetchModIdFromWorkshop(workshopIdStr);
          if (steamModId) {
            modId = steamModId;
            autoDetectedCount++;
            log.info(
              `Auto-detected mod ID from Steam Workshop: ${steamModId} for workshop ${m.workshopId}`,
            );
          }
        }
      }

      // Final safeguard: if detection failed and modId still looks like a
      // Steam Workshop ID (all-numeric), drop it. PZ resolves Mods= against
      // the letter-based `id=` field from mod.info — a numeric value there
      // silently fails to load AND pollutes the INI (this is the root cause
      // of the "numeric IDs merged into Mods=" bug).
      if (modId && looksLikeWorkshopId(String(modId))) {
        log.warn(
          `Dropping unresolved numeric modId "${modId}" for workshop ${m.workshopId} (would have polluted Mods=)`,
        );
        modId = null;
      }

      resolvedMods.push({
        workshopId: m.workshopId,
        modId: modId || null,
      });
    }

    const modIdList = sanitizeModIdList(
      resolvedMods.map((m) => m.modId).filter(Boolean),
    );
    const workshopIdList = sanitizeIniList(
      resolvedMods.map((m) => m.workshopId).filter(Boolean),
    );

    // Auto-detect map folders from downloaded workshop mods if not provided
    let detectedMapFolders = mapFolders || [];
    if (serverPath && (!mapFolders || mapFolders.length === 0)) {
      for (const m of mods) {
        const workshopIdStr = String(m.workshopId);
        const modMapFolders = findMapFoldersFromWorkshop(
          workshopIdStr,
          serverPath,
        );
        for (const folder of modMapFolders) {
          if (!detectedMapFolders.includes(folder)) {
            detectedMapFolders.push(folder);
            log.info(
              `Auto-detected map folder: ${folder} from workshop ${workshopIdStr}`,
            );
          }
        }
      }
    }

    // Build Map= string - mod maps must come BEFORE the main map
    // Format: "ModMap1;ModMap2;Muldraugh, KY"
    let mapList = "Muldraugh, KY";
    if (detectedMapFolders && detectedMapFolders.length > 0) {
      mapList = `${sanitizeIniList(detectedMapFolders)};Muldraugh, KY`;
    }

    // Atomically read-modify-write the ini file inside the lock
    await withIniLock(iniPath, async () => {
      let content = readTextFile(iniPath);

      // Update or add Mods= (mod IDs like NeatUI_Framework)
      if (content.includes("Mods=")) {
        content = content.replace(/^Mods=.*/m, `Mods=${modIdList}`);
      } else {
        content += `\nMods=${modIdList}`;
      }

      // Update or add WorkshopItems= (workshop IDs like 3508537032)
      if (content.includes("WorkshopItems=")) {
        content = content.replace(
          /^WorkshopItems=.*/m,
          `WorkshopItems=${workshopIdList}`,
        );
      } else {
        content += `\nWorkshopItems=${workshopIdList}`;
      }

      // Update or add Map= (only if we have custom maps)
      if (detectedMapFolders && detectedMapFolders.length > 0) {
        if (content.includes("Map=")) {
          content = content.replace(/^Map=.*/m, `Map=${mapList}`);
        } else {
          content += `\nMap=${mapList}`;
        }
      }

      await fileAccess.writeFile(iniPath, content);
    });

    log.info(
      `Wrote ${mods.length} mods to ${iniPath} (${autoDetectedCount} mod IDs auto-detected, ${detectedMapFolders.length} map folders)`,
    );

    res.json({
      success: true,
      message: `Successfully configured ${mods.length} mods in server config.${autoDetectedCount > 0 ? ` (${autoDetectedCount} mod IDs auto-detected)` : ""}${detectedMapFolders.length > 0 ? ` Map folders: ${detectedMapFolders.join(", ")}` : ""}`,
      iniPath,
      modsConfigured: mods.length,
      autoDetectedModIds: autoDetectedCount,
      modIds: modIdList,
      workshopItems: workshopIdList,
      mapList,
      mapFolders: detectedMapFolders,
    });
  } catch (error) {
    log.error(`Failed to write mods to ini: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
