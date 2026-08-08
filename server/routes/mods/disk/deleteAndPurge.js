import express from "express";
import { createLogger } from "../../../utils/logger.js";
import {
  getTrackedMods,
  removeTrackedMod,
  addIgnoredMod,
  getSetting,
} from "../../../database/init.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import { removeItemFromCollection } from "../../../services/workshopCollectionSync.js";
import { deleteModFromDiskAndIni } from "../../../utils/mods/diskModOps.js";

const log = createLogger("API:Mods");
const router = express.Router();

// Delete a mod from disk: removes the workshop content folder, and also
// strips the workshop ID + any of its mod-folder IDs from the server INI
// so the server won't try to load it on next start. Used by the "Disabled
// mods on disk" and "Ignored mods" panels in the Mods page UI.
router.post("/delete-disk-mod", async (req, res) => {
  try {
    const { workshopId } = req.body || {};
    const wsId = String(workshopId || "");
    if (!/^\d{1,15}$/.test(wsId)) {
      return res.status(400).json({ error: "Invalid workshop ID" });
    }

    const { removedPath, modIdsToStrip, iniEditApplied } =
      await deleteModFromDiskAndIni(wsId);

    // Drop from tracking, then ADD to the ignore list so auto-sync won't
    // re-track the mod next time Steam re-downloads it. Delete is meant to
    // be a "gone forever" action, not a temporary cleanup. Gated on
    // iniEditApplied — if the INI was never actually reached, the mod ID
    // may still be sitting in Mods=/WorkshopItems= and must not be
    // ignore-listed as if it had been removed from the server config.
    let priorName = null;
    try {
      const tracked = await getTrackedMods();
      priorName =
        tracked?.find((m) => String(m.workshop_id) === wsId)?.name || null;
    } catch {
      /* ignore */
    }
    if (!priorName && req.body?.modName)
      priorName = String(req.body.modName).slice(0, 200);
    if (iniEditApplied) {
      try {
        await removeTrackedMod(wsId);
      } catch {
        /* ignore */
      }
      try {
        await addIgnoredMod(wsId, priorName);
      } catch {
        /* ignore */
      }
    } else {
      log.error(
        `delete-disk-mod ${wsId}: INI edit was never applied (missing server config path or ini file) — not ignore-listing`,
      );
    }

    log.info(
      `Deleted disk mod ${wsId} (folder: ${removedPath || "not found"}, mod IDs stripped: ${modIdsToStrip.length})`,
    );
    res.json({
      success: true,
      workshopId: wsId,
      deletedFromDisk: !!removedPath,
      modIdsStripped: modIdsToStrip.length,
    });
  } catch (error) {
    log.error(`Failed to delete disk mod: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// "Remove everywhere" — the single action for a mod you never want back.
// Steam collection, then server INI, then disk, then tracking, and finally
// ignore-listed so a later scan can't quietly re-add it. The collection step
// is reported separately because it is the only one that can fail for a
// reason the user can fix (missing Steam cookies).
router.post("/purge", async (req, res) => {
  try {
    const wsId = String(req.body?.workshopId || "").trim();
    if (!/^\d{1,15}$/.test(wsId)) {
      return res.status(400).json({ error: "Invalid workshop ID" });
    }

    // Read the name before untracking, or the ignore list loses it.
    let name = null;
    try {
      const tracked = await getTrackedMods();
      name = tracked?.find((m) => String(m.workshop_id) === wsId)?.name || null;
    } catch {
      /* ignore */
    }
    if (!name && req.body?.name) name = String(req.body.name).slice(0, 200);

    const collection = { attempted: false, ok: false, error: null };
    const collectionId = await getSetting("workshopCollectionId");
    if (collectionId) {
      collection.attempted = true;
      try {
        const r = await removeItemFromCollection(collectionId, wsId);
        collection.ok = !!r.ok;
        if (!r.ok) collection.error = r.error || "Steam rejected the change";
      } catch (e) {
        collection.error = e.message;
      }
    }

    const { removedPath, modIdsToStrip, mapFoldersToStrip, iniEditApplied } =
      await deleteModFromDiskAndIni(wsId);

    if (!iniEditApplied) {
      log.error(
        `Purge ${wsId}: INI edit was never applied (missing server config path or ini file) — not untracking or ignore-listing`,
      );
      return res.status(500).json({
        error:
          "Server config file was not found or not accessible — the mod was not removed from the server.",
        collection,
        deletedFromDisk: !!removedPath,
      });
    }

    try {
      await removeTrackedMod(wsId);
    } catch {
      /* ignore */
    }
    try {
      await addIgnoredMod(wsId, name);
    } catch {
      /* ignore */
    }

    log.info(
      `Purged ${wsId} (${name || "unknown name"}): collection=${
        collection.attempted ? (collection.ok ? "removed" : "failed") : "skipped"
      }, disk=${removedPath || "not found"}, mod IDs stripped=${
        modIdsToStrip.length
      }, map folders stripped=${mapFoldersToStrip.length}`,
    );

    res.json({
      success: true,
      workshopId: wsId,
      name,
      collection,
      deletedFromDisk: !!removedPath,
      modIdsStripped: modIdsToStrip.length,
      mapFoldersStripped: mapFoldersToStrip.length,
    });
  } catch (error) {
    log.error(`Purge failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
