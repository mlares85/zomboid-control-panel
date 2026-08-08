import express from "express";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import { getServerPath } from "../../../utils/mods/serverConfig.js";
import { getModDetailsFromWorkshop } from "../../../utils/mods/workshopModInfo.js";
import { findMapFoldersFromWorkshop } from "../../../utils/mods/workshopPaths.js";

const log = createLogger("API:Mods");
const router = express.Router();

// Get mod info from Steam Workshop (for a single mod)
router.post("/get-mod-info", async (req, res) => {
  try {
    const { workshopId } = req.body;

    if (!workshopId) {
      return res.status(400).json({ error: "Workshop ID is required" });
    }

    const workshopIdStr = String(workshopId);
    if (!/^\d{1,15}$/.test(workshopIdStr)) {
      return res.status(400).json({ error: "Invalid Workshop ID format" });
    }

    const infoAbort = new AbortController();
    const infoTimer = setTimeout(() => infoAbort.abort(), 15000);
    let response;
    try {
      response = await fetch(
        "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            itemcount: "1",
            "publishedfileids[0]": workshopId,
          }),
          signal: infoAbort.signal,
        },
      );
    } finally {
      clearTimeout(infoTimer);
    }

    if (!response.ok) {
      throw new Error(`Steam API returned ${response.status}`);
    }

    const data = await response.json();
    const modInfo = data.response?.publishedfiledetails?.[0];

    if (!modInfo || modInfo.result !== 1) {
      return res.status(404).json({ error: "Mod not found" });
    }

    res.json({
      workshopId: modInfo.publishedfileid,
      name: modInfo.title,
      description: modInfo.description?.substring(0, 500),
      tags: modInfo.tags?.map((t) => t.tag) || [],
      isMap:
        modInfo.tags?.some(
          (t) =>
            t.tag?.toLowerCase() === "map" || t.tag?.toLowerCase() === "maps",
        ) || false,
      timeUpdated: modInfo.time_updated,
      timeCreated: modInfo.time_created,
    });
  } catch (error) {
    log.error(`Failed to get mod info: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Return available Mod IDs inside a downloaded Workshop Item
router.post("/inspect-workshop-item", async (req, res) => {
  try {
    const { workshopId } = req.body;
    if (!workshopId) {
      return res.status(400).json({ error: "Workshop ID is required" });
    }

    // Validate workshopId is numeric to prevent path traversal
    if (!/^\d{1,15}$/.test(String(workshopId))) {
      return res.status(400).json({ error: "Invalid Workshop ID" });
    }

    const serverPath = await getServerPath();
    if (!serverPath) {
      return res.status(400).json({
        error: "Server path not configured",
        detail: "Set the server install path in Servers > Edit.",
        fixUrl: "/servers",
      });
    }

    const mods = getModDetailsFromWorkshop(workshopId, serverPath);

    // Also try to find map folders
    const mapFolders = findMapFoldersFromWorkshop(workshopId, serverPath);

    res.json({
      workshopId,
      found: mods.length > 0 || mapFolders.length > 0,
      mods,
      mapFolders,
      count: mods.length,
    });
  } catch (error) {
    log.error(`Failed to inspect workshop item: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
