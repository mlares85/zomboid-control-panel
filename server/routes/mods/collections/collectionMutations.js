import express from "express";
import { createLogger } from "../../../utils/logger.js";
import { getTrackedMods, removeTrackedMod, getSetting } from "../../../database/init.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import {
  getCollectionContents,
  addItemToCollection,
  removeItemFromCollection,
  computeDiff as computeCollectionDiff,
  fetchPublishedFileTitles,
} from "../../../services/workshopCollectionSync.js";

const log = createLogger("API:Mods");
const router = express.Router();

// ── Per-item collection mutations ─────────────────────────────────────────
// Used by the unified Sync UI: each row in the table has its own
// add/remove button. Bulk sync (`/collection/sync`) is still available
// for one-click "fix everything".

router.post("/collection/items", async (req, res) => {
  try {
    const collectionId = await getSetting("workshopCollectionId");
    if (!collectionId) {
      return res.status(400).json({ error: "Collection ID not configured" });
    }
    const workshopId = String(req.body?.workshopId || "").trim();
    if (!/^\d{1,15}$/.test(workshopId)) {
      return res.status(400).json({ error: "Invalid workshop ID" });
    }
    const r = await addItemToCollection(collectionId, workshopId);
    if (!r.ok)
      return res
        .status(502)
        .json({ error: r.error || "Steam rejected the change" });
    res.json({ ok: true, workshopId, action: "add" });
  } catch (error) {
    log.error(`Collection add failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.delete("/collection/items/:workshopId", async (req, res) => {
  try {
    const collectionId = await getSetting("workshopCollectionId");
    if (!collectionId) {
      return res.status(400).json({ error: "Collection ID not configured" });
    }
    const workshopId = String(req.params.workshopId || "").trim();
    if (!/^\d{1,15}$/.test(workshopId)) {
      return res.status(400).json({ error: "Invalid workshop ID" });
    }
    const r = await removeItemFromCollection(collectionId, workshopId);
    if (!r.ok)
      return res
        .status(502)
        .json({ error: r.error || "Steam rejected the change" });
    res.json({ ok: true, workshopId, action: "remove" });
  } catch (error) {
    log.error(`Collection remove failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Stop panel tracking for an optional collection item. Unlike DELETE /track,
// this intentionally does not create an ignore rule or modify Steam.
router.delete("/collection/tracking/:workshopId", async (req, res) => {
  try {
    const workshopId = String(req.params.workshopId || "").trim();
    if (!/^\d{1,15}$/.test(workshopId)) {
      return res.status(400).json({ error: "Invalid workshop ID" });
    }
    const removed = await removeTrackedMod(workshopId);
    res.json({
      ok: true,
      workshopId,
      removed,
      message: removed
        ? "Mod is no longer tracked; Steam collection and server configuration were unchanged"
        : "Mod was not tracked",
    });
  } catch (error) {
    log.error(`Collection tracking removal failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/collection/sync", async (req, res) => {
  try {
    const collectionId = await getSetting("workshopCollectionId");
    if (!collectionId) {
      return res.status(400).json({ error: "Collection ID not configured" });
    }
    const tracked = await getTrackedMods();
    const trackedIds = tracked.map((m) => String(m.workshop_id));
    const diff = await computeCollectionDiff(trackedIds);
    if (!diff.ok) {
      return res
        .status(502)
        .json({ error: diff.error || "Could not read collection" });
    }

    const added = [];
    const errors = [];
    let staleSession = false;

    // Sequential with a small delay keeps Steam happy when a fresh setup has
    // dozens of pending changes. Steam will silently throttle / 429 a tight
    // loop. The lists are usually small after the first run.
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const STALE_RE = /session expired|HTTP 302|HTTP 401|HTTP 403/i;

    for (const id of diff.toAdd) {
      const r = await addItemToCollection(collectionId, id);
      if (r.ok) added.push(id);
      else {
        errors.push({ action: "add", id, error: r.error });
        if (r.error && STALE_RE.test(r.error)) {
          staleSession = true;
          break;
        }
      }
      await sleep(300);
    }
    const failedTitles = await fetchPublishedFileTitles(errors.map(({ id }) => id));
    const detailedErrors = errors.map((entry) => ({
      ...entry,
      title: failedTitles.get(entry.id) || null,
    }));
    res.json({
      success: detailedErrors.length === 0,
      collectionId,
      added,
      removed: [],
      errors: detailedErrors,
      staleSession,
      message:
        detailedErrors.length === 0
          ? `Synced — added ${added.length}`
          : staleSession
            ? "Steam session expired — paste fresh cookies and try again"
            : `Steam rejected ${detailedErrors.length} item${detailedErrors.length !== 1 ? "s" : ""}`,
    });
  } catch (error) {
    log.error(`Collection sync failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Validate that the configured cookies can edit the collection. Tries a
// no-mutation read of the collection first, then attempts a tiny add+remove
// dance on a known item to prove write access. We use the FIRST item already
// in the collection to avoid actually changing its contents.
router.post("/collection/test", async (req, res) => {
  try {
    const collectionId = await getSetting("workshopCollectionId");
    if (!collectionId)
      return res.status(400).json({ error: "Collection ID not configured" });
    const sessionId = await getSetting("steamSessionId");
    const loginSecure = await getSetting("steamLoginSecure");
    if (!sessionId || !loginSecure)
      return res
        .status(400)
        .json({ error: "Steam session cookies not configured" });

    const contents = await getCollectionContents(collectionId);
    if (!contents.ok)
      return res
        .status(502)
        .json({ error: contents.error || "Could not read collection" });

    // Read-only test: confirms the collection ID is valid and reachable. We
    // deliberately do NOT exercise write access here — any write probe would
    // mutate the user's real collection. Write capability is verified the
    // first time a real sync runs, where a stale session surfaces clearly.
    res.json({
      success: true,
      collectionId,
      title: contents.title,
      itemCount: contents.items.length,
      writeVerified: false,
      message: contents.title
        ? `Collection "${contents.title}" found (${contents.items.length} items). Write access is verified on first sync.`
        : `Collection found (${contents.items.length} items). Write access is verified on first sync.`,
    });
  } catch (error) {
    log.error(`Collection test failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
