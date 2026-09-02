import express from "express";
import path from "path";
import { createLogger } from "../../../utils/logger.js";
import { getTrackedMods, getSetting } from "../../../database/init.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import {
  computeDiff as computeCollectionDiff,
  fetchPublishedFileTitles,
} from "../../../services/workshopCollectionSync.js";
import { getServerConfigPath, getServerName } from "../../../utils/mods/serverConfig.js";
import { readTextFile, parseIniList } from "../../../utils/mods/iniFile.js";
import { LocalFiles } from "../../../services/fileAccess/index.js";

const log = createLogger("API:Mods");
const router = express.Router();

// ============================================
// Workshop Collection Sync
// Mirrors the tracked-mod list into a user-owned Steam Workshop collection.
// Reads are public; writes need the user's session cookies (settings).
// ============================================

router.get("/collection/diff", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const tracked = await getTrackedMods();
    const ids = tracked.map((m) => String(m.workshop_id));
    const diff = await computeCollectionDiff(ids);
    const configuredWorkshopIds = new Set();
    // Whether WorkshopItems= was actually read. Status below is derived from
    // server membership, so an unreadable INI must not be reported as "every
    // mod is missing from the server".
    let serverConfigRead = false;
    try {
      const serverConfigPath = await getServerConfigPath();
      const serverName = await getServerName();
      const sanitizedServerName = path.basename(serverName || "");
      if (
        serverConfigPath &&
        sanitizedServerName === serverName &&
        !serverName.includes("..")
      ) {
        const iniPath = path.join(serverConfigPath, `${serverName}.ini`);
        if (await fileAccess.exists(iniPath)) {
          const workshopMatch = readTextFile(iniPath).match(
            /^WorkshopItems=(.*)$/m,
          );
          for (const id of parseIniList(workshopMatch?.[1])) {
            configuredWorkshopIds.add(id);
          }
          serverConfigRead = true;
        }
      }
    } catch (error) {
      serverConfigRead = false;
      log.debug(`Collection server membership check skipped: ${error.message}`);
    }

    // Build a unified, name-enriched item list so the UI can show every
    // tracked + collection mod in one table with per-row actions. This is
    // best-effort: if Steam is unreachable we still return the raw IDs.
    let items = [];
    if (diff.ok) {
      const trackedNames = new Map(
        tracked.map((m) => {
          const workshopId = String(m.workshop_id);
          const name = typeof m.name === "string" ? m.name.trim() : "";
          // Older tracking entries use this generated label until Steam has
          // supplied a real title. Treat it as missing so collection search
          // and the synced list show the same name as Steam.
          const isPlaceholder = name === `Workshop Mod ${workshopId}`;
          return [workshopId, isPlaceholder ? null : name || null];
        }),
      );
      const inCollection = new Set(diff.inCollection.map(String));
      // Mods enabled on the server are included even when they are neither
      // tracked nor in the collection (an ignored mod, say) — they are drift
      // and would otherwise be invisible here.
      const allIds = new Set([
        ...trackedNames.keys(),
        ...inCollection,
        ...configuredWorkshopIds,
      ]);
      // Resolve names for collection-only items (and any tracked items
      // missing a stored name).
      const needTitles = [...allIds].filter((id) => !trackedNames.get(id));
      const titleMap =
        needTitles.length > 0
          ? await fetchPublishedFileTitles(needTitles)
          : new Map();
      items = [...allIds].map((id) => {
        const inTracked = trackedNames.has(id);
        const inColl = inCollection.has(id);
        const inServer = configuredWorkshopIds.has(id);
        // The collection is meant to mirror what the server actually loads,
        // so drift is measured against WorkshopItems=. Tracking alone no
        // longer implies the mod is on the server: deactivated mods stay
        // tracked on purpose. Fall back to tracking when the INI is
        // unreadable, otherwise every row would claim to be off-server.
        const present = serverConfigRead ? inServer : inTracked;
        let status;
        if (present && inColl) status = "synced";
        else if (present && !inColl) status = "to-add";
        else if (!present && inColl) status = "collection-only";
        else status = "tracked-only";
        return {
          workshopId: id,
          name: trackedNames.get(id) || titleMap.get(id) || null,
          status,
          inTracked,
          inCollection: inColl,
          inServer,
        };
      });
      // Mods on the server but missing from the collection need attention
      // first, then collection entries the server no longer loads, then
      // tracked leftovers, then everything already in sync.
      const order = {
        "to-add": 0,
        "collection-only": 1,
        "tracked-only": 2,
        synced: 3,
      };
      items.sort((a, b) => {
        if (order[a.status] !== order[b.status])
          return order[a.status] - order[b.status];
        const an = (a.name || a.workshopId).toLowerCase();
        const bn = (b.name || b.workshopId).toLowerCase();
        return an.localeCompare(bn);
      });
    }

    // Match the same shape buildAuthCookies() requires: real (non-masked)
    // strings, of plausible length. Otherwise the UI would happily show
    // "configured" while the actual write endpoints fail with "Steam
    // session cookies not configured".
    const sidVal = await getSetting("steamSessionId");
    const lsVal = await getSetting("steamLoginSecure");
    const looksMasked = (v) =>
      typeof v === "string" && (v.startsWith("••••••••") || /^[•*]+$/.test(v));
    const hasCredentials =
      typeof sidVal === "string" &&
      sidVal.trim().length >= 8 &&
      !looksMasked(sidVal) &&
      typeof lsVal === "string" &&
      lsVal.trim().length >= 16 &&
      !looksMasked(lsVal);

    // Decode JWT expiry from steamLoginSecure to warn the UI about stale tokens.
    let tokenExpiry = null;
    let tokenExpired = false;
    if (hasCredentials && lsVal) {
      try {
        // steamLoginSecure format: <steamid>%7C%7C<jwt> (URL-encoded ||)
        const decoded = decodeURIComponent(lsVal.trim());
        const jwtPart = decoded.split("||")[1];
        if (jwtPart) {
          const payload = JSON.parse(
            Buffer.from(jwtPart.split(".")[1], "base64").toString(),
          );
          if (payload.exp) {
            tokenExpiry = payload.exp * 1000; // ms epoch
            tokenExpired = Date.now() > tokenExpiry;
          }
        }
      } catch {
        /* non-JWT format or decode failure — ignore */
      }
    }

    res.json({
      ...diff,
      items,
      collectionId: (await getSetting("workshopCollectionId")) || null,
      autoSync: !!(await getSetting("workshopCollectionAutoSync")),
      hasCredentials,
      tokenExpiry,
      tokenExpired,
      trackedCount: ids.length,
      serverConfigRead,
    });
  } catch (error) {
    log.error(`Collection diff failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
