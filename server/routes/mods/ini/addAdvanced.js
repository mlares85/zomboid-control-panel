import express from "express";
import path from "path";
import fs from "fs";
import { createLogger } from "../../../utils/logger.js";
import { removeIgnoredMod, addTrackedMod } from "../../../database/init.js";
import { sanitizeError, sanitizeIniList, sanitizeModIdList } from "../../../utils/sanitize.js";
import { syncSingleChange as autoSyncCollection } from "../../../services/workshopCollectionSync.js";
import { getServerConfigPath, getServerName, getServerPath } from "../../../utils/mods/serverConfig.js";
import { readTextFile, withIniLock } from "../../../utils/mods/iniFile.js";
import { findAllModIdsFromWorkshop } from "../../../utils/mods/workshopModInfo.js";
import { findMapFoldersFromWorkshop } from "../../../utils/mods/workshopPaths.js";

const log = createLogger("API:Mods");
const router = express.Router();

// Add mod with specific mod IDs selected (for multi-ID mods)
router.post("/add-mod-advanced", async (req, res) => {
  try {
    const { workshopId, selectedModIds, includeAllModIds } = req.body;
    // workshopId: the Steam Workshop ID
    // selectedModIds: array of mod IDs to add (user-selected)
    // includeAllModIds: boolean - if true, add all discovered mod IDs

    if (!workshopId) {
      return res.status(400).json({ error: "Workshop ID is required" });
    }

    if (!selectedModIds && !includeAllModIds) {
      return res.status(400).json({
        error: "Either selectedModIds or includeAllModIds is required",
      });
    }

    // Validate workshopId is numeric
    if (!/^\d{1,15}$/.test(String(workshopId))) {
      return res.status(400).json({ error: "Invalid Workshop ID" });
    }

    const serverConfigPath = await getServerConfigPath();
    const serverName = await getServerName();
    const serverPath = await getServerPath();

    if (!serverConfigPath) {
      return res.status(400).json({ error: "Server config path not set" });
    }

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
      return res.status(400).json({ error: "Server config file not found" });
    }

    // Validate mod ID format BEFORE taking the lock (prevent INI injection)
    let modIdsToAdd = selectedModIds || [];
    for (const modId of modIdsToAdd) {
      if (
        typeof modId !== "string" ||
        !modId.trim() ||
        /[\r\n;=]/.test(modId) ||
        modId.length > 200
      ) {
        return res.status(400).json({
          error: `Invalid mod ID format: ${String(modId).substring(0, 50)}`,
        });
      }
    }

    if (includeAllModIds && serverPath) {
      const allModIds = findAllModIdsFromWorkshop(
        String(workshopId),
        serverPath,
      );
      modIdsToAdd = [...new Set([...modIdsToAdd, ...allModIds])];
    }

    // Detect map folders outside the lock (sync disk reads)
    let modMapFolders = [];
    if (serverPath) {
      modMapFolders = findMapFoldersFromWorkshop(
        String(workshopId),
        serverPath,
      );
    }

    // Atomically read-modify-write inside the lock
    let addedMapFolders = [];
    const lockResult = await withIniLock(iniPath, () => {
      let content = readTextFile(iniPath);

      const workshopMatch = content.match(/^WorkshopItems=(.*)$/m);
      const currentWorkshopIds =
        workshopMatch?.[1]?.split(";").filter(Boolean) || [];
      const modsMatch = content.match(/^Mods=(.*)$/m);
      const currentModIds = modsMatch?.[1]?.split(";").filter(Boolean) || [];

      const workshopAlreadyExists = currentWorkshopIds.includes(
        String(workshopId),
      );
      if (!workshopAlreadyExists) {
        currentWorkshopIds.push(String(workshopId));
      }

      const addedModIds = [];
      for (const modId of modIdsToAdd) {
        if (!currentModIds.includes(modId)) {
          currentModIds.push(modId);
          addedModIds.push(modId);
        }
      }

      const newWorkshopList = sanitizeIniList(currentWorkshopIds);
      const newModList = sanitizeModIdList(currentModIds);

      if (content.includes("WorkshopItems=")) {
        content = content.replace(
          /^WorkshopItems=.*/m,
          `WorkshopItems=${newWorkshopList}`,
        );
      } else {
        content += `\nWorkshopItems=${newWorkshopList}`;
      }

      if (content.includes("Mods=")) {
        content = content.replace(/^Mods=.*/m, `Mods=${newModList}`);
      } else {
        content += `\nMods=${newModList}`;
      }

      if (modMapFolders.length > 0) {
        const mapMatch = content.match(/^Map=(.*)$/m);
        let currentMaps = mapMatch?.[1]?.split(";").filter(Boolean) || [
          "Muldraugh, KY",
        ];

        for (const folder of modMapFolders) {
          if (!currentMaps.includes(folder)) {
            currentMaps.unshift(folder);
            addedMapFolders.push(folder);
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
        addedModIds,
        totalModIdsInConfig: currentModIds.length,
        workshopAlreadyExisted: workshopAlreadyExists,
      };
    });

    // Also add to tracking (and clear from ignore list if present)
    try {
      await removeIgnoredMod(String(workshopId));
      await addTrackedMod(String(workshopId), `Workshop Mod ${workshopId}`);
    } catch (e) {
      // Ignore if already tracked
    }

    // Best-effort: mirror this add into the configured Steam Workshop
    // collection if auto-sync is enabled. Never blocks the response.
    autoSyncCollection("add", String(workshopId)).catch(() => {});

    log.info(
      `Added mod ${workshopId} with ${lockResult.addedModIds.length} mod IDs: ${lockResult.addedModIds.join(", ")}`,
    );

    res.json({
      success: true,
      workshopId,
      addedModIds: lockResult.addedModIds,
      totalModIdsInConfig: lockResult.totalModIdsInConfig,
      workshopAlreadyExisted: lockResult.workshopAlreadyExisted,
      mapFoldersAdded: addedMapFolders,
      message:
        lockResult.addedModIds.length > 0
          ? `Added ${lockResult.addedModIds.length} mod ID(s): ${lockResult.addedModIds.join(", ")}`
          : "Workshop ID added (mod IDs were already configured)",
    });
  } catch (error) {
    log.error(`Failed to add mod advanced: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
