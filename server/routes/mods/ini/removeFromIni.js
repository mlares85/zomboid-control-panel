import express from "express";
import path from "path";
import { createLogger } from "../../../utils/logger.js";
import { LocalFiles } from "../../../services/fileAccess/index.js";
import { sanitizeError, sanitizeIniList, sanitizeModIdList } from "../../../utils/sanitize.js";
import { getServerConfigPath, getServerName, getServerPath } from "../../../utils/mods/serverConfig.js";
import { readTextFile, withIniLock } from "../../../utils/mods/iniFile.js";
import { findAllModIdsFromWorkshop, findModIdFromWorkshop } from "../../../utils/mods/workshopModInfo.js";
import { findMapFoldersFromWorkshop } from "../../../utils/mods/workshopPaths.js";
import { filterOwnedClientModIds } from "../../../utils/mods/modIdFilter.js";

const log = createLogger("API:Mods");
const router = express.Router();

// Remove a single mod from server .ini file
router.post("/remove-from-ini", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const { workshopId, modId, modIds: clientModIds } = req.body;

    if (!workshopId) {
      return res.status(400).json({ error: "Workshop ID is required" });
    }

    // Validate workshopId is numeric to prevent path traversal
    if (!/^\d{1,15}$/.test(String(workshopId))) {
      return res.status(400).json({ error: "Invalid Workshop ID" });
    }

    const knownModIds = Array.isArray(clientModIds)
      ? clientModIds.slice(0, 50)
      : [];

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

    // Atomically read-modify-write inside the lock
    const lockResult = await withIniLock(iniPath, async () => {
      let content = readTextFile(iniPath);

      // Get current workshop items
      const workshopMatch = content.match(/^WorkshopItems=(.*)$/m);
      let workshopIds = workshopMatch?.[1]?.split(";").filter(Boolean) || [];

      // Get current mod IDs
      const modsMatch = content.match(/^Mods=(.*)$/m);
      let modIds = modsMatch?.[1]?.split(";").filter(Boolean) || [];

      // Remove from workshop items
      workshopIds = workshopIds.filter((id) => id !== String(workshopId));

      // Determine which mod IDs to remove (a workshop item can have multiple mods)
      let removedModIds = [];
      let ownedModIds = [];

      if (serverPath) {
        // Find ALL mod IDs for this workshop item
        const allModIds = findAllModIdsFromWorkshop(
          String(workshopId),
          serverPath,
        );
        ownedModIds = allModIds;
        if (allModIds.length > 0) {
          for (const mid of allModIds) {
            if (modIds.includes(mid)) {
              modIds = modIds.filter((id) => id !== mid);
              removedModIds.push(mid);
            }
          }
          log.info(
            `Found mod IDs for workshop ${workshopId}: ${allModIds.join(", ")}`,
          );
        }
      }

      // Also remove explicitly provided modId if server-side workshop data
      // verifies that it belongs to this workshop item.
      if (
        modId &&
        ownedModIds.includes(modId) &&
        !removedModIds.includes(modId) &&
        modIds.includes(modId)
      ) {
        modIds = modIds.filter((id) => id !== modId);
        removedModIds.push(modId);
      }

      // Fallback: if no mods removed via filesystem, try single lookup
      if (removedModIds.length === 0 && !modId && serverPath) {
        const fallbackModId = findModIdFromWorkshop(
          String(workshopId),
          serverPath,
        );
        if (fallbackModId && modIds.includes(fallbackModId)) {
          modIds = modIds.filter((id) => id !== fallbackModId);
          removedModIds.push(fallbackModId);
        }
      }

      // Last resort: use client-known IDs only when they are also verified
      // against server-side workshop data for this exact Workshop item.
      const verifiedKnownModIds = filterOwnedClientModIds(
        knownModIds,
        ownedModIds,
      );
      if (removedModIds.length === 0 && verifiedKnownModIds.length > 0) {
        for (const mid of verifiedKnownModIds) {
          if (modIds.includes(mid) && !removedModIds.includes(mid)) {
            modIds = modIds.filter((id) => id !== mid);
            removedModIds.push(mid);
          }
        }
        if (removedModIds.length > 0) {
          log.info(
            `Fallback: removed ${removedModIds.join(", ")} for workshop ${workshopId} via client-provided mod IDs`,
          );
        }
      }

      // Check if this mod has map folders and remove them from Map=
      let removedMapFolders = [];
      if (serverPath) {
        const modMapFolders = findMapFoldersFromWorkshop(
          String(workshopId),
          serverPath,
        );
        if (modMapFolders.length > 0) {
          const mapMatch = content.match(/^Map=(.*)$/m);
          let currentMaps = mapMatch?.[1]?.split(";").filter(Boolean) || [];

          for (const folder of modMapFolders) {
            if (currentMaps.includes(folder)) {
              currentMaps = currentMaps.filter((m) => m !== folder);
              removedMapFolders.push(folder);
              log.info(
                `Removed map folder: ${folder} for workshop ${workshopId}`,
              );
            }
          }

          if (currentMaps.length === 0) {
            currentMaps = ["Muldraugh, KY"];
          }

          const newMapList = currentMaps.join(";");
          if (content.includes("Map=")) {
            content = content.replace(/^Map=.*/m, `Map=${newMapList}`);
          } else {
            content += `\nMap=${newMapList}`;
          }
        }
      }

      // Update WorkshopItems=
      if (content.includes("WorkshopItems=")) {
        content = content.replace(
          /^WorkshopItems=.*/m,
          `WorkshopItems=${sanitizeIniList(workshopIds)}`,
        );
      }

      // Update Mods=
      if (content.includes("Mods=")) {
        content = content.replace(
          /^Mods=.*/m,
          `Mods=${sanitizeModIdList(modIds)}`,
        );
      }

      await fileAccess.writeFile(iniPath, content);
      return {
        removedModIds,
        removedMapFolders,
        remainingWorkshopItems: workshopIds.length,
        remainingMods: modIds.length,
      };
    });

    log.info(
      `Removed workshop ID ${workshopId}${lockResult.removedModIds.length > 0 ? ` and mod IDs ${lockResult.removedModIds.join(", ")}` : ""}${lockResult.removedMapFolders.length > 0 ? ` and map folders: ${lockResult.removedMapFolders.join(", ")}` : ""} from ${iniPath}`,
    );

    res.json({
      success: true,
      message:
        lockResult.removedModIds.length > 0
          ? `Mod removed from server configuration (WorkshopItems, Mods${lockResult.removedMapFolders.length > 0 ? ", and Map" : ""})`
          : "Workshop ID removed. Note: Could not find matching mod ID - you may need to manually remove it from Mods= in the .ini file.",
      workshopId,
      modIdsRemoved: lockResult.removedModIds,
      mapFoldersRemoved: lockResult.removedMapFolders,
      remainingWorkshopItems: lockResult.remainingWorkshopItems,
      remainingMods: lockResult.remainingMods,
    });
  } catch (error) {
    log.error(`Failed to remove mod from ini: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
