import express from "express";
import path from "path";
import fs from "fs";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError, sanitizeIniList, sanitizeModIdList } from "../../../utils/sanitize.js";
import { getServerConfigPath, getServerName, getServerPath } from "../../../utils/mods/serverConfig.js";
import { readTextFile, withIniLock } from "../../../utils/mods/iniFile.js";
import { findMapFoldersFromWorkshop } from "../../../utils/mods/workshopPaths.js";
import { findModIdFromWorkshop } from "../../../utils/mods/workshopModInfo.js";
import { fetchModIdFromWorkshop } from "../../../utils/mods/workshopFetch.js";

const log = createLogger("API:Mods");
const router = express.Router();

// Add a single mod to server .ini file (appends to existing mods)
router.post("/add-to-ini", async (req, res) => {
  try {
    const { workshopId, modId } = req.body;
    // workshopId: the Steam Workshop ID
    // modId: optional - the mod loading ID (from info.txt). If not provided, workshopId is used as a placeholder

    if (!workshopId) {
      return res.status(400).json({ error: "Workshop ID is required" });
    }

    // Validate workshopId is numeric
    if (!/^\d{1,15}$/.test(String(workshopId))) {
      return res.status(400).json({ error: "Invalid Workshop ID" });
    }

    const serverConfigPath = await getServerConfigPath();
    const serverName = await getServerName();

    if (!serverConfigPath) {
      return res.status(400).json({
        error:
          "Server config path not set. Please configure the server first in Settings.",
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

    if (!fs.existsSync(iniPath)) {
      return res.status(400).json({
        error:
          "Server config file not found. Start the server once first to generate the config file.",
      });
    }

    // Do all async detection work BEFORE taking the lock
    let detectedModId = modId;
    let detectionSource = "provided";
    const serverPath = await getServerPath();

    if (!detectedModId) {
      // First, try to find from already downloaded workshop folder
      if (serverPath) {
        detectedModId = findModIdFromWorkshop(String(workshopId), serverPath);
        if (detectedModId) {
          detectionSource = "local-files";
          log.info(
            `Auto-detected mod ID from local files: ${detectedModId} for workshop ${workshopId}`,
          );
        }
      }

      // If not found locally, try to fetch from Steam Workshop page description
      if (!detectedModId) {
        detectedModId = await fetchModIdFromWorkshop(String(workshopId));
        if (detectedModId) {
          detectionSource = "steam-workshop";
          log.info(
            `Auto-detected mod ID from Steam Workshop: ${detectedModId} for workshop ${workshopId}`,
          );
        }
      }
    }

    // Detect map folders (async-safe, doesn't touch INI)
    let addedMapFolders = [];
    let modMapFolders = [];
    if (serverPath) {
      modMapFolders = findMapFoldersFromWorkshop(
        String(workshopId),
        serverPath,
      );
    }

    // Atomically read-modify-write inside the lock
    const result = await withIniLock(iniPath, () => {
      let content = readTextFile(iniPath);

      const workshopMatch = content.match(/^WorkshopItems=(.*)$/m);
      const currentWorkshopIds =
        workshopMatch?.[1]?.split(";").filter(Boolean) || [];
      const modsMatch = content.match(/^Mods=(.*)$/m);
      const currentModIds = modsMatch?.[1]?.split(";").filter(Boolean) || [];

      // Check if mod is already in the list
      if (currentWorkshopIds.includes(String(workshopId))) {
        return { alreadyExists: true };
      }

      // Add the new workshop ID
      currentWorkshopIds.push(String(workshopId));
      const newWorkshopList = sanitizeIniList(currentWorkshopIds);

      // Add the mod ID if we have one (provided or detected)
      if (detectedModId && !currentModIds.includes(detectedModId)) {
        currentModIds.push(detectedModId);
      }
      const newModList = sanitizeModIdList(currentModIds);

      // Update WorkshopItems=
      if (content.includes("WorkshopItems=")) {
        content = content.replace(
          /^WorkshopItems=.*/m,
          `WorkshopItems=${newWorkshopList}`,
        );
      } else {
        content += `\nWorkshopItems=${newWorkshopList}`;
      }

      // Update Mods= if we have a modId
      if (detectedModId) {
        if (content.includes("Mods=")) {
          content = content.replace(/^Mods=.*/m, `Mods=${newModList}`);
        } else {
          content += `\nMods=${newModList}`;
        }
      }

      // Add map folders if detected
      if (modMapFolders.length > 0) {
        const mapMatch = content.match(/^Map=(.*)$/m);
        let currentMaps = mapMatch?.[1]?.split(";").filter(Boolean) || [
          "Muldraugh, KY",
        ];

        for (const folder of modMapFolders) {
          if (!currentMaps.includes(folder)) {
            currentMaps.unshift(folder);
            addedMapFolders.push(folder);
            log.info(`Added map folder: ${folder} for workshop ${workshopId}`);
          }
        }

        const newMapList = currentMaps.join(";");
        if (content.includes("Map=")) {
          content = content.replace(/^Map=.*/m, `Map=${newMapList}`);
        } else {
          content += `\nMap=${newMapList}`;
        }
      }

      fs.writeFileSync(iniPath, content, "utf-8");
      return {
        alreadyExists: false,
        totalWorkshopItems: currentWorkshopIds.length,
      };
    });

    if (result.alreadyExists) {
      return res.json({
        success: true,
        message: "Mod is already configured in the server",
        alreadyExists: true,
      });
    }

    log.info(
      `Added mod ${workshopId} to ${iniPath}${addedMapFolders.length > 0 ? ` with map folders: ${addedMapFolders.join(", ")}` : ""}`,
    );

    res.json({
      success: true,
      message: detectedModId
        ? `Mod added to server configuration${addedMapFolders.length > 0 ? ` with map folders: ${addedMapFolders.join(", ")}` : ""}`
        : "Workshop ID added (mod will be downloaded on server start)",
      workshopId,
      modId: detectedModId || null,
      autoDetected: !modId && !!detectedModId,
      detectionSource: detectedModId ? detectionSource : null,
      totalWorkshopItems: result.totalWorkshopItems,
      mapFoldersAdded: addedMapFolders,
      note: detectedModId
        ? undefined
        : 'Mod ID could not be auto-detected. You may need to add it manually or use "Sync Mod IDs" after the mod is downloaded.',
    });
  } catch (error) {
    log.error(`Failed to add mod to ini: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
