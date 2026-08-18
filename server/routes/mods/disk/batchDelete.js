import express from "express";
import { createLogger } from "../../../utils/logger.js";
import { getTrackedMods, removeTrackedMod, addIgnoredMod } from "../../../database/init.js";
import { sanitizeError, sanitizeIniList, sanitizeModIdList } from "../../../utils/sanitize.js";
import { getServerConfigPath, getServerName, getServerPath } from "../../../utils/mods/serverConfig.js";
import { readTextFile, withIniLock } from "../../../utils/mods/iniFile.js";
import { findAllModIdsFromWorkshop } from "../../../utils/mods/workshopModInfo.js";
import { getWorkshopPaths } from "../../../utils/mods/workshopPaths.js";
import path from "path";
import { LocalFiles } from "../../../services/fileAccess/index.js";

const log = createLogger("API:Mods");
const router = express.Router();

router.post("/batch-delete-disk-mods", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const { workshopIds } = req.body || {};
    if (!Array.isArray(workshopIds) || workshopIds.length === 0) {
      return res
        .status(400)
        .json({ error: "workshopIds must be a non-empty array" });
    }
    const cleaned = workshopIds
      .map(String)
      .filter((id) => /^\d{1,15}$/.test(id));
    if (cleaned.length === 0) {
      return res.status(400).json({ error: "No valid workshop IDs provided" });
    }

    const serverConfigPath = await getServerConfigPath();
    const serverName = await getServerName();
    const serverPath = await getServerPath();
    const sanitized = serverName ? path.basename(serverName) : null;
    const iniPath =
      sanitized && serverConfigPath
        ? path.join(serverConfigPath, `${sanitized}.ini`)
        : null;

    // Capture all mod IDs BEFORE we start deleting.
    const allModIdsToStrip = new Set();
    for (const wsId of cleaned) {
      if (serverPath) {
        for (const m of findAllModIdsFromWorkshop(wsId, serverPath))
          allModIdsToStrip.add(m);
      }
    }

    // Delete folders.
    const results = [];
    for (const wsId of cleaned) {
      const possiblePaths = getWorkshopPaths(wsId, serverPath || "");
      let removed = false;
      for (const p of possiblePaths) {
        if (await fileAccess.exists(p)) {
          const result = await fileAccess.rm(p, { recursive: true, force: true });
          if (result.success) {
            removed = true;
            break;
          }
          log.warn(`Failed to delete ${p}: ${result.error}`);
        }
      }
      results.push({ workshopId: wsId, deletedFromDisk: removed });
    }

    // One INI write for the whole batch.
    if (iniPath && (await fileAccess.exists(iniPath))) {
      await withIniLock(iniPath, async () => {
        let content = readTextFile(iniPath);
        const wsMatch = content.match(/^WorkshopItems=(.*)$/m);
        if (wsMatch) {
          const wsList = wsMatch[1]
            .split(";")
            .filter(Boolean)
            .filter((id) => !cleaned.includes(id));
          content = content.replace(
            /^WorkshopItems=.*/m,
            `WorkshopItems=${sanitizeIniList(wsList)}`,
          );
        }
        const modsMatch = content.match(/^Mods=(.*)$/m);
        if (modsMatch && allModIdsToStrip.size > 0) {
          const modsList = modsMatch[1]
            .split(";")
            .filter(Boolean)
            .filter((id) => !allModIdsToStrip.has(id));
          content = content.replace(
            /^Mods=.*/m,
            `Mods=${sanitizeModIdList(modsList)}`,
          );
        }
        await fileAccess.writeFile(iniPath, content, "utf-8");
      });
    }

    // Drop from tracking, then ADD to the ignore list so auto-sync won't
    // re-track the mod next time Steam re-downloads it.
    let trackedById = new Map();
    try {
      for (const m of (await getTrackedMods()) || []) {
        if (m?.workshop_id)
          trackedById.set(String(m.workshop_id), m.name || null);
      }
    } catch {
      /* ignore */
    }
    for (const wsId of cleaned) {
      try {
        await removeTrackedMod(wsId);
      } catch {
        /* ignore */
      }
      try {
        await addIgnoredMod(wsId, trackedById.get(wsId) || null);
      } catch {
        /* ignore */
      }
    }

    const deletedCount = results.filter((r) => r.deletedFromDisk).length;
    log.info(
      `Batch deleted ${deletedCount}/${cleaned.length} disk mods (mod IDs stripped: ${allModIdsToStrip.size})`,
    );
    res.json({
      success: true,
      total: cleaned.length,
      deletedFromDisk: deletedCount,
      modIdsStripped: allModIdsToStrip.size,
      results,
    });
  } catch (error) {
    log.error(`Failed to batch delete disk mods: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
