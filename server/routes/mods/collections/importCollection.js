import express from "express";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError } from "../../../utils/sanitize.js";

const log = createLogger("API:Mods");
const router = express.Router();

// Get Steam Workshop collection details (extract all mods from a collection)
router.post("/import-collection", async (req, res) => {
  try {
    const { collectionUrl } = req.body;

    if (!collectionUrl) {
      return res
        .status(400)
        .json({ error: "Collection URL or ID is required" });
    }

    // Extract collection ID from URL or use directly
    let collectionId = collectionUrl;
    const urlMatch = collectionUrl.match(/id=(\d+)/);
    if (urlMatch) {
      collectionId = urlMatch[1];
    }

    // Validate it's a number
    if (!/^\d{1,15}$/.test(collectionId)) {
      return res.status(400).json({ error: "Invalid collection ID" });
    }

    log.info(`Fetching collection details for ID: ${collectionId}`);

    // Use Steam API to get collection details
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let collectionResponse;
    try {
      collectionResponse = await fetch(
        "https://api.steampowered.com/ISteamRemoteStorage/GetCollectionDetails/v1/",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            collectioncount: "1",
            "publishedfileids[0]": collectionId,
          }),
          signal: controller.signal,
        },
      );
    } catch (error) {
      if (error.name === "AbortError") {
        return res.status(504).json({
          error: "Steam collection lookup timed out. Please try again.",
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!collectionResponse.ok) {
      throw new Error(`Steam API returned ${collectionResponse.status}`);
    }

    const collectionData = await collectionResponse.json();

    if (!collectionData.response?.collectiondetails?.[0]) {
      return res.status(404).json({ error: "Collection not found" });
    }

    const collection = collectionData.response.collectiondetails[0];

    if (collection.result !== 1) {
      return res
        .status(404)
        .json({ error: "Collection not found or is private" });
    }

    const modIds = collection.children?.map((c) => c.publishedfileid) || [];

    if (modIds.length === 0) {
      return res.json({
        success: true,
        message: "Collection is empty",
        mods: [],
      });
    }

    // Now get details for each mod in the collection
    const modFormData = new URLSearchParams();
    modFormData.append("itemcount", modIds.length.toString());
    modIds.forEach((id, index) => {
      modFormData.append(`publishedfileids[${index}]`, id);
    });

    const modsAbort = new AbortController();
    const modsTimer = setTimeout(() => modsAbort.abort(), 15000);
    let modsResponse;
    try {
      modsResponse = await fetch(
        "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: modFormData,
          signal: modsAbort.signal,
        },
      );
    } finally {
      clearTimeout(modsTimer);
    }

    if (!modsResponse.ok) {
      throw new Error(`Steam API returned ${modsResponse.status}`);
    }

    const modsData = await modsResponse.json();

    const mods = (modsData.response?.publishedfiledetails || [])
      .filter((m) => m.result === 1)
      .map((m) => ({
        workshopId: m.publishedfileid,
        name: m.title,
        description: m.description?.substring(0, 200),
        tags: m.tags?.map((t) => t.tag) || [],
        isMap:
          m.tags?.some(
            (t) =>
              t.tag?.toLowerCase() === "map" || t.tag?.toLowerCase() === "maps",
          ) || false,
      }));

    log.info(`Found ${mods.length} mods in collection ${collectionId}`);

    res.json({
      success: true,
      collectionId,
      totalMods: mods.length,
      mods,
    });
  } catch (error) {
    log.error(`Failed to import collection: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
