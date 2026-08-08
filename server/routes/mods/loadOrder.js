import express from "express";
import fs from "fs";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError, sanitizeModIdList } from "../../utils/sanitize.js";
import { getServerConfigPath, getServerName, getServerPath, getSanitizedIniPath } from "../../utils/mods/serverConfig.js";
import { readTextFile, withIniLock } from "../../utils/mods/iniFile.js";
import { findAllModIdsFromWorkshop } from "../../utils/mods/workshopModInfo.js";
import { findMapFoldersFromWorkshop } from "../../utils/mods/workshopPaths.js";

const log = createLogger("API:Mods");
const router = express.Router();

// Save mod load order
router.post("/save-order", async (req, res) => {
  try {
    const { modIds } = req.body;

    if (!Array.isArray(modIds)) {
      return res.status(400).json({ error: "modIds must be an array" });
    }
    if (modIds.length > 2000) {
      return res.status(400).json({ error: "Too many mod IDs (max 2000)" });
    }
    for (const id of modIds) {
      if (typeof id !== "string" || id.length > 200) {
        return res
          .status(400)
          .json({ error: "Each mod ID must be a string (max 200 chars)" });
      }
    }

    const serverConfigPath = await getServerConfigPath();
    const serverName = await getServerName();
    const iniPath = getSanitizedIniPath(serverConfigPath, serverName);

    if (!iniPath) {
      return res.status(400).json({ error: "Invalid server name" });
    }

    if (!fs.existsSync(iniPath)) {
      return res.status(400).json({ error: "Server INI not found" });
    }

    await withIniLock(iniPath, () => {
      let content = readTextFile(iniPath);

      const modsLine = `Mods=${sanitizeModIdList(modIds)}`;
      if (content.includes("Mods=")) {
        content = content.replace(/^Mods=.*/m, modsLine);
      } else {
        content += `\n${modsLine}`;
      }

      fs.writeFileSync(iniPath, content, "utf-8");
    });

    log.info(`Saved mod load order: ${modIds.length} mods`);
    res.json({
      message: "Mod load order saved successfully",
      modCount: modIds.length,
    });
  } catch (error) {
    log.error(`Failed to save mod order: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/discover-mod-ids", async (req, res) => {
  try {
    const { workshopId, workshopUrl } = req.body;

    // Parse workshop ID from URL if provided
    let wsId = workshopId;
    if (!wsId && workshopUrl) {
      const urlMatch = workshopUrl.match(/id=(\d+)/);
      if (urlMatch) {
        wsId = urlMatch[1];
      }
    }

    if (!wsId) {
      return res.status(400).json({ error: "Workshop ID or URL is required" });
    }

    // Validate it's a number
    if (!/^\d{1,15}$/.test(String(wsId))) {
      return res.status(400).json({ error: "Invalid Workshop ID" });
    }

    const serverPath = await getServerPath();
    const discoveredModIds = [];
    const sources = [];

    // 1. First try local files (most accurate if mod is already downloaded)
    if (serverPath) {
      const localModIds = findAllModIdsFromWorkshop(String(wsId), serverPath);
      for (const modId of localModIds) {
        if (!discoveredModIds.includes(modId)) {
          discoveredModIds.push(modId);
          sources.push({ modId, source: "local-files" });
        }
      }
    }

    // 2. Try Steam Workshop API to get mod info (with timeout)
    let modInfo = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(
        "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            itemcount: "1",
            "publishedfileids[0]": wsId,
          }),
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        modInfo = data.response?.publishedfiledetails?.[0];

        // Handle Steam API error codes
        if (modInfo && modInfo.result !== 1) {
          log.warn(
            `Steam API returned error for workshop ${wsId}: result=${modInfo.result}`,
          );
          modInfo = null;
        }
      }
    } catch (e) {
      if (e.name === "AbortError") {
        log.warn(`Steam API request timed out for workshop ${wsId}`);
      } else {
        log.warn(
          `Failed to fetch Steam API for workshop ${wsId}: ${e.message}`,
        );
      }
    }

    // 3. Parse mod IDs from description (if not found locally)
    if (modInfo && modInfo.result === 1 && discoveredModIds.length === 0) {
      const description = modInfo.description || "";

      // Try various patterns to find mod IDs
      const patterns = [
        // Pattern: "Mod ID: SomeName" or "ModID: SomeName" (can appear multiple times)
        /Mod\s*ID\s*[:=]\s*([A-Za-z0-9_-]+)/gi,
        // Pattern: "id=SomeName"
        /\bid\s*=\s*([A-Za-z0-9_-]+)/gi,
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(description)) !== null) {
          const modId = match[1].trim();
          // Skip numeric-only values (likely workshop IDs)
          if (!/^\d{1,15}$/.test(modId) && !discoveredModIds.includes(modId)) {
            discoveredModIds.push(modId);
            sources.push({ modId, source: "steam-description" });
          }
        }
      }
    }

    // Deduplicate mod IDs (some mods list the same ID multiple times)
    const uniqueModIds = [...new Set(discoveredModIds)];

    // Get map folders if available
    let mapFolders = [];
    if (serverPath) {
      mapFolders = findMapFoldersFromWorkshop(String(wsId), serverPath);
    }

    // Check if mod has map tag from Steam API
    const isMap =
      modInfo?.tags?.some(
        (t) =>
          t.tag?.toLowerCase() === "map" || t.tag?.toLowerCase() === "maps",
      ) || mapFolders.length > 0;

    res.json({
      success: true,
      workshopId: wsId,
      name: modInfo?.title || `Workshop Mod ${wsId}`,
      description: modInfo?.description?.substring(0, 500) || null,
      modIds: uniqueModIds,
      hasMultipleModIds: uniqueModIds.length > 1,
      sources,
      isMap,
      mapFolders,
      isDownloaded: serverPath
        ? findAllModIdsFromWorkshop(String(wsId), serverPath).length > 0
        : false,
      tags: modInfo?.tags?.map((t) => t.tag) || [],
    });
  } catch (error) {
    log.error(`Failed to discover mod IDs: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
