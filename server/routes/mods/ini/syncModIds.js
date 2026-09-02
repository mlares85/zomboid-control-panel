import express from "express";
import path from "path";
import { createLogger } from "../../../utils/logger.js";
import { LocalFiles } from "../../../services/fileAccess/index.js";
import { sanitizeError, sanitizeModIdList } from "../../../utils/sanitize.js";
import { getServerConfigPath, getServerName, getServerPath } from "../../../utils/mods/serverConfig.js";
import { readTextFile, withIniLock, parseIniList } from "../../../utils/mods/iniFile.js";
import { findAllModIdsFromWorkshop } from "../../../utils/mods/workshopModInfo.js";
import { fetchModIdFromWorkshop } from "../../../utils/mods/workshopFetch.js";

const log = createLogger("API:Mods");
const router = express.Router();

// ─── Sync mod IDs from Workshop → INI ─────────────────────────────────────
router.post("/sync-mod-ids", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
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
    if (!(await fileAccess.exists(iniPath))) {
      return res.status(400).json({ error: "Server config file not found" });
    }

    // First pass: read INI to get workshop IDs list (no lock needed for read-only)
    const preContent = readTextFile(iniPath);
    const preWorkshopMatch = preContent.match(/^WorkshopItems=(.*)$/m);
    const workshopIds = parseIniList(preWorkshopMatch?.[1]).filter((id) =>
      /^\d{1,15}$/.test(id),
    );

    // Pre-resolve all mod IDs BEFORE taking the lock (async operations)
    const resolvedMap = new Map(); // workshopId -> { availableModIds, fallbackId, error }
    for (const workshopId of workshopIds) {
      try {
        const availableModIds = findAllModIdsFromWorkshop(
          workshopId,
          serverPath,
        );
        if (availableModIds.length > 0) {
          resolvedMap.set(workshopId, { availableModIds, fallbackId: null });
        } else {
          const fallbackId = await fetchModIdFromWorkshop(workshopId);
          resolvedMap.set(workshopId, { availableModIds: [], fallbackId });
        }
      } catch (err) {
        log.error(`Error processing workshop ID ${workshopId}: ${err.message}`);
        resolvedMap.set(workshopId, {
          availableModIds: [],
          fallbackId: null,
          error: true,
        });
      }
    }

    // Atomically re-read, modify, and write inside the lock
    const lockResult = await withIniLock(iniPath, async () => {
      let content = readTextFile(iniPath);

      const modsMatch = content.match(/^Mods=(.*)$/m);
      const currentModIds = parseIniList(modsMatch?.[1]);
      const finalModIds = [...currentModIds];

      const syncedMods = [];
      const missingMods = [];

      for (const workshopId of workshopIds) {
        const resolved = resolvedMap.get(workshopId);
        if (!resolved || resolved.error) {
          missingMods.push(workshopId);
          continue;
        }

        const { availableModIds, fallbackId } = resolved;

        if (availableModIds.length > 0) {
          const present = availableModIds.filter((id) =>
            currentModIds.includes(id),
          );
          if (present.length > 0) {
            syncedMods.push({
              workshopId,
              mods: present,
              status: "verified_present",
            });
          } else {
            const defaultMod = availableModIds[0];
            if (!finalModIds.includes(defaultMod)) {
              finalModIds.push(defaultMod);
              syncedMods.push({
                workshopId,
                mods: [defaultMod],
                status: "added_default",
              });
              log.info(
                `Auto-added default mod ID '${defaultMod}' for workshop item ${workshopId}`,
              );
            }
            if (availableModIds.length > 1) {
              syncedMods[syncedMods.length - 1].alternatives =
                availableModIds.slice(1);
            }
          }
        } else if (fallbackId) {
          if (!finalModIds.includes(fallbackId)) {
            finalModIds.push(fallbackId);
            syncedMods.push({
              workshopId,
              mods: [fallbackId],
              status: "added_from_steam_api",
            });
          } else {
            syncedMods.push({
              workshopId,
              mods: [fallbackId],
              status: "verified_present_api",
            });
          }
        } else {
          missingMods.push(workshopId);
        }
      }

      const newModList = sanitizeModIdList(finalModIds);
      if (content.includes("Mods=")) {
        content = content.replace(/^Mods=.*/m, `Mods=${newModList}`);
      } else {
        content += `\nMods=${newModList}`;
      }

      await fileAccess.writeFile(iniPath, content);
      return { syncedMods, missingMods, totalModIds: finalModIds.length };
    });

    const addedCount = lockResult.syncedMods.filter((m) =>
      m.status.startsWith("added"),
    ).length;

    log.info(
      `Synced mod IDs: ${addedCount} added, ${lockResult.missingMods.length} missing downloads`,
    );

    res.json({
      success: true,
      message: `Synced configuration. Added ${addedCount} missing mod IDs. ${lockResult.missingMods.length} items need download.`,
      syncedMods: lockResult.syncedMods,
      missingMods: lockResult.missingMods,
      totalModIds: lockResult.totalModIds,
      note:
        lockResult.missingMods.length > 0
          ? "Start server to download missing workshop items."
          : undefined,
    });
  } catch (error) {
    log.error(`Failed to sync mod IDs: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
