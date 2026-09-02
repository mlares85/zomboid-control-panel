import express from "express";
import path from "path";
import fs from "fs";
import { createLogger } from "../../../utils/logger.js";
import { getTrackedMods, removeTrackedMod, addIgnoredMod } from "../../../database/init.js";
import { sanitizeError, sanitizeIniList, sanitizeModIdList } from "../../../utils/sanitize.js";
import { syncSingleChange as autoSyncCollection } from "../../../services/workshopCollectionSync.js";
import { getServerConfigPath, getServerName, getServerPath } from "../../../utils/mods/serverConfig.js";
import { readTextFile, withIniLock, parseIniList } from "../../../utils/mods/iniFile.js";
import { findAllModIdsFromWorkshop } from "../../../utils/mods/workshopModInfo.js";
import { findMapFoldersFromWorkshop } from "../../../utils/mods/workshopPaths.js";

const log = createLogger("API:Mods");
const router = express.Router();

// Batch remove multiple mods from tracking AND server .ini in a single operation
// Avoids the N×2 individual API call problem for bulk removal
router.post("/batch-remove", async (req, res) => {
  try {
    const { workshopIds } = req.body;

    if (!Array.isArray(workshopIds) || workshopIds.length === 0) {
      return res.status(400).json({ error: "workshopIds array is required" });
    }

    // Cap batch size to prevent abuse
    if (workshopIds.length > 500) {
      return res.status(400).json({ error: "Maximum 500 mods per batch" });
    }

    // Validate all IDs upfront
    const validIds = [];
    for (const id of workshopIds) {
      const str = String(id);
      if (/^\d{1,15}$/.test(str)) validIds.push(str);
    }

    if (validIds.length === 0) {
      return res.status(400).json({ error: "No valid workshop IDs provided" });
    }

    // Step 1: Get mod names before removal (for ignore list)
    const trackedMods = await getTrackedMods();
    const modNameMap = new Map();
    for (const mod of trackedMods) {
      modNameMap.set(mod.workshop_id, mod.name);
    }

    // Step 2: Prepare database removal results. Apply these only after the
    // INI edit succeeds so a filesystem error cannot leave tracking removed
    // while WorkshopItems= still loads the mod.
    const dbResults = { removed: 0, failed: 0 };

    // Step 2: Remove all from INI in a single locked write
    const serverConfigPath = await getServerConfigPath();
    const serverPath = await getServerPath();
    const serverName = await getServerName();

    let iniResult = { removed: 0, skipped: 0 };
    // Tracks whether the INI edit block below actually ran. Ignore-listing
    // must never happen unless this is true, or a mod can be marked
    // "removed" while still silently loading from the live Mods=/
    // WorkshopItems= lines (root cause of mods getting stuck in the ignore
    // list without ever leaving the server config).
    let iniEditApplied = false;

    if (serverConfigPath && serverName) {
      const sanitizedServerName = path.basename(serverName);
      if (
        sanitizedServerName &&
        sanitizedServerName === serverName &&
        !serverName.includes("..")
      ) {
        const iniPath = path.join(
          serverConfigPath,
          `${sanitizedServerName}.ini`,
        );

        if (fs.existsSync(iniPath)) {
          iniEditApplied = true;
          iniResult = await withIniLock(iniPath, () => {
            let content = readTextFile(iniPath);
            const removeSet = new Set(validIds);

            // Parse current lists
            const workshopMatch = content.match(/^WorkshopItems=(.*)$/m);
            let iniWorkshopIds = parseIniList(workshopMatch?.[1]);

            const modsMatch = content.match(/^Mods=(.*)$/m);
            let iniModIds = parseIniList(modsMatch?.[1]);

            const mapMatch = content.match(/^Map=(.*)$/m);
            let iniMaps = mapMatch?.[1]?.split(";").filter(Boolean) || [];

            // Collect all mod IDs and map folders to remove
            const modIdsToRemove = new Set();
            const mapFoldersToRemove = new Set();

            for (const wsId of validIds) {
              if (serverPath) {
                const allModIds = findAllModIdsFromWorkshop(wsId, serverPath);
                for (const mid of allModIds) modIdsToRemove.add(mid);

                const mapFolders = findMapFoldersFromWorkshop(wsId, serverPath);
                for (const folder of mapFolders) mapFoldersToRemove.add(folder);
              }
            }

            // Filter lists
            const origWsCount = iniWorkshopIds.length;
            const origModCount = iniModIds.length;
            iniWorkshopIds = iniWorkshopIds.filter((id) => !removeSet.has(id));
            iniModIds = iniModIds.filter((id) => !modIdsToRemove.has(id));
            iniMaps = iniMaps.filter((m) => !mapFoldersToRemove.has(m));

            if (iniMaps.length === 0) iniMaps = ["Muldraugh, KY"];

            // Write back
            if (content.includes("WorkshopItems=")) {
              content = content.replace(
                /^WorkshopItems=.*/m,
                `WorkshopItems=${sanitizeIniList(iniWorkshopIds)}`,
              );
            }
            if (content.includes("Mods=")) {
              content = content.replace(
                /^Mods=.*/m,
                `Mods=${sanitizeModIdList(iniModIds)}`,
              );
            }
            if (content.includes("Map=")) {
              content = content.replace(
                /^Map=.*/m,
                `Map=${sanitizeIniList(iniMaps)}`,
              );
            }

            fs.writeFileSync(iniPath, content, "utf-8");

            const wsRemoved = origWsCount - iniWorkshopIds.length;
            const modRemoved = origModCount - iniModIds.length;
            log.info(
              `Batch INI removal: removed ${wsRemoved} workshop IDs, ${modRemoved} mod IDs, ${mapFoldersToRemove.size} map folders`,
            );

            return { removed: wsRemoved, skipped: validIds.length - wsRemoved };
          });
        }
      }
    }

    // Step 3: Remove all from database and add to ignore list. This happens
    // after the INI operation so a locked-write failure aborts before any
    // tracking state is changed. Gated on iniEditApplied: if the INI edit
    // never ran (bad config path, missing ini file, etc.), the mod is still
    // live in Mods=/WorkshopItems= and must NOT be ignore-listed as if it
    // had been removed.
    if (iniEditApplied) {
      for (const wsId of validIds) {
        try {
          await removeTrackedMod(wsId);
          await addIgnoredMod(wsId, modNameMap.get(wsId) || null);
          dbResults.removed++;
        } catch (e) {
          dbResults.failed++;
          log.debug(`DB removal failed for ${wsId}: ${e.message}`);
        }
      }
    } else {
      log.error(
        `Batch removal aborted before any INI edit (serverConfigPath=${serverConfigPath}, serverName=${serverName}, validIds=${validIds.join(",")}) — nothing was removed or ignore-listed`,
      );
    }

    // Mirror removals to the Workshop collection when auto-sync is enabled.
    if (iniEditApplied && validIds.length > 0) {
      (async () => {
        for (const wsId of validIds) {
          try {
            await autoSyncCollection("remove", wsId);
          } catch {
            /* logged inside */
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      })().catch(() => {});
    }

    res.json({
      success: iniEditApplied,
      total: validIds.length,
      dbRemoved: dbResults.removed,
      dbFailed: dbResults.failed,
      iniRemoved: iniResult.removed,
      iniSkipped: iniResult.skipped,
      ...(iniEditApplied
        ? {}
        : {
            error:
              "Server config file was not found or not accessible — no mods were removed.",
          }),
    });
  } catch (error) {
    log.error(`Batch removal failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
