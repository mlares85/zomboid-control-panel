import express from "express";
import path from "path";
import fs from "fs";
import { createLogger } from "../../../utils/logger.js";
import {
  getTrackedMods,
  addTrackedMod,
  removeTrackedMod,
  isModIgnored,
  removeIgnoredMod,
  addIgnoredMod,
} from "../../../database/init.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import { fetchPublishedFileTitles, syncSingleChange as autoSyncCollection } from "../../../services/workshopCollectionSync.js";
import { getServerConfigPath, getServerName } from "../../../utils/mods/serverConfig.js";
import { readTextFile } from "../../../utils/mods/iniFile.js";
import { requireModChecker } from "../../../middleware/requireModChecker.js";

const log = createLogger("API:Mods");
const router = express.Router();

function shouldRefreshTrackedModName(name) {
  return (
    !name || /^Workshop Mod /i.test(name) || /\[\s*Legacy\s*\]/i.test(name)
  );
}

// Get mod checker status
router.get("/status", requireModChecker, async (req, res) => {
  try {
    const status = await req.modChecker.getStatus();
    res.json(status);
  } catch (error) {
    log.error(`Failed to get mod checker status: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Get all tracked mods
router.get("/tracked", async (req, res) => {
  try {
    // ─── Auto-track from INI ────────────────────────────────────────────────
    // Tracking is no longer a user-managed concept: any workshop ID present
    // in the server's INI is automatically tracked so it gets polled for
    // Workshop updates (which trigger the auto-restart). This keeps the
    // mental model simple — "what's on the server is what gets tracked".
    // We skip mods the user has explicitly removed (ignore list) so this
    // doesn't fight the "Remove from server" action.
    try {
      const serverConfigPath = await getServerConfigPath();
      const serverName = await getServerName();
      if (serverConfigPath && serverName) {
        const sanitizedServerName = path.basename(serverName);
        if (sanitizedServerName === serverName && !serverName.includes("..")) {
          const iniPath = path.join(
            serverConfigPath,
            `${sanitizedServerName}.ini`,
          );
          if (fs.existsSync(iniPath)) {
            const content = readTextFile(iniPath);
            const workshopMatch = content.match(/^WorkshopItems=(.*)$/m);
            const workshopIds =
              workshopMatch?.[1]?.split(";").filter(Boolean) || [];
            const configuredIds = new Set(
              workshopIds.filter((id) => /^\d{1,15}$/.test(id)),
            );
            const trackedNow = await getTrackedMods();

            // Tracked mods absent from WorkshopItems= are deliberately kept:
            // they are what the Mods > Deactivated tab lists so they can be
            // re-enabled or deleted on purpose. Pruning them here silently
            // emptied that tab on the next page load. "Remove from server"
            // already untracks and ignore-lists in one step.
            if (configuredIds.size > 0) {
              const trackedSet = new Set(
                trackedNow.map((m) => m.workshop_id),
              );
              const modChecker = req.app.get("modChecker");
              let added = 0;
              for (const wsId of configuredIds) {
                if (trackedSet.has(wsId)) continue;
                if (await isModIgnored(wsId)) continue;
                const nameFromDisk =
                  await modChecker?.resolveModNameFromDisk(wsId);
                await addTrackedMod(
                  wsId,
                  nameFromDisk || `Workshop Mod ${wsId}`,
                );
                added++;
              }
              if (added > 0) log.info(`Auto-tracked ${added} mods from INI`);
            }
          }
        }
      }
    } catch (e) {
      log.debug(`Auto-track from INI skipped: ${e.message}`);
    }

    const mods = await getTrackedMods();

    // Enrich generic or stale display names with real names from disk, then
    // Steam for mods that are not downloaded locally. A tracked mod should
    // never stay a generic workshop-ID label just because it is deactivated.
    const modChecker = req.app.get("modChecker");
    if (modChecker) {
      let updated = 0;
      const unresolvedIds = [];
      for (const mod of mods) {
        if (shouldRefreshTrackedModName(mod.name)) {
          const realName = await modChecker.resolveModNameFromDisk(
            mod.workshop_id,
            true,
          );
          if (realName && realName !== mod.name) {
            mod.name = realName;
            // Persist the resolved name in the database
            await addTrackedMod(mod.workshop_id, realName);
            updated++;
          } else {
            unresolvedIds.push(mod.workshop_id);
          }
        }
      }
      if (unresolvedIds.length > 0) {
        const titles = await fetchPublishedFileTitles(unresolvedIds);
        for (const mod of mods) {
          const realName = titles.get(mod.workshop_id);
          if (realName && shouldRefreshTrackedModName(mod.name)) {
            mod.name = realName;
            await addTrackedMod(mod.workshop_id, realName);
            updated++;
          }
        }
      }
      if (updated > 0) {
        log.debug(`Resolved ${updated} tracked mod names`);
      }
    }

    res.json({ mods });
  } catch (error) {
    log.error(`Failed to get tracked mods: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Refresh display names for tracked mods that still show a generic
// "Workshop Mod <id>" placeholder. Tries the on-disk mod.info first, then
// falls back to Steam's GetPublishedFileDetails (batched) for mods whose
// workshop folder isn't on this machine yet.
router.post("/refresh-names", async (req, res) => {
  try {
    const modChecker = req.app.get("modChecker");
    const { workshopIds } = req.body || {};
    const targetSet =
      Array.isArray(workshopIds) && workshopIds.length > 0
        ? new Set(workshopIds.map(String).filter((id) => /^\d{1,15}$/.test(id)))
        : null;

    const mods = await getTrackedMods();
    const candidates = mods.filter((m) => {
      if (targetSet && !targetSet.has(m.workshop_id)) return false;
      return shouldRefreshTrackedModName(m.name);
    });

    let diskResolved = 0;
    let steamResolved = 0;
    const stillUnresolved = [];

    // Pass 1: try disk
    for (const mod of candidates) {
      const nameFromDisk = await modChecker?.resolveModNameFromDisk(
        mod.workshop_id,
        true,
      );
      if (nameFromDisk) {
        await addTrackedMod(mod.workshop_id, nameFromDisk);
        diskResolved++;
      } else {
        stillUnresolved.push(mod.workshop_id);
      }
    }

    // Pass 2: batched Steam API for whatever's left
    if (stillUnresolved.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < stillUnresolved.length; i += BATCH) {
        const slice = stillUnresolved.slice(i, i + BATCH);
        const params = new URLSearchParams();
        params.append("itemcount", String(slice.length));
        slice.forEach((id, idx) =>
          params.append(`publishedfileids[${idx}]`, id),
        );
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10000);
          const r = await fetch(
            "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
            { method: "POST", body: params, signal: controller.signal },
          );
          clearTimeout(timer);
          if (!r.ok) continue;
          const data = await r.json();
          const items = data?.response?.publishedfiledetails || [];
          for (const item of items) {
            if (
              item?.result === 1 &&
              typeof item.title === "string" &&
              item.title.trim()
            ) {
              await addTrackedMod(
                String(item.publishedfileid),
                item.title.trim(),
              );
              steamResolved++;
            }
          }
        } catch (e) {
          log.debug(`Steam name refresh batch failed: ${e.message}`);
        }
      }
    }

    res.json({
      success: true,
      checked: candidates.length,
      diskResolved,
      steamResolved,
      totalResolved: diskResolved + steamResolved,
      unresolved: candidates.length - diskResolved - steamResolved,
    });
  } catch (error) {
    log.error(`Failed to refresh mod names: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Add a mod to track
router.post("/track", requireModChecker, async (req, res) => {
  try {
    const { workshopId } = req.body;
    log.info(`POST /track: workshopId=${workshopId}`);

    if (!workshopId) {
      return res.status(400).json({ error: "Workshop ID is required" });
    }

    const workshopIdStr = String(workshopId);
    if (!/^\d{1,15}$/.test(workshopIdStr)) {
      return res.status(400).json({ error: "Invalid Workshop ID format" });
    }

    // Clear from ignore list if present (user explicitly wants to track this)
    await removeIgnoredMod(workshopIdStr);

    const result = await req.modChecker.addModToTrack(workshopIdStr);
    // Best-effort Workshop collection mirror — fire-and-forget so the user's
    // tracking action never blocks on Steam being slow or cookies being stale.
    autoSyncCollection("add", workshopIdStr).catch(() => {});
    res.json(result);
  } catch (error) {
    log.error(`Failed to add mod to track: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Remove a mod from tracking
router.delete("/track/:workshopId", async (req, res) => {
  try {
    const { workshopId } = req.params;

    // Validate workshopId is a numeric string
    if (!workshopId || !/^\d{1,15}$/.test(workshopId)) {
      return res.status(400).json({ error: "Invalid workshop ID" });
    }

    // Get mod name before removing (for the ignore list)
    const trackedMods = await getTrackedMods();
    const mod = trackedMods.find((m) => m.workshop_id === workshopId);

    await removeTrackedMod(workshopId);
    // Add to ignored list so auto-sync won't re-add it
    await addIgnoredMod(workshopId, mod?.name || null);
    // Mirror removal into the Workshop collection if auto-sync is on.
    autoSyncCollection("remove", workshopId).catch(() => {});
    res.json({
      success: true,
      message: "Mod removed from tracking and added to ignore list",
    });
  } catch (error) {
    log.error(`Failed to remove tracked mod: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
