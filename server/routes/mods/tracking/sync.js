import express from "express";
import path from "path";
import fs from "fs";
import { createLogger } from "../../../utils/logger.js";
import { addTrackedMod, clearModUpdates, isModIgnored } from "../../../database/init.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import { getServerConfigPath, getServerName } from "../../../utils/mods/serverConfig.js";
import { readTextFile, parseIniList } from "../../../utils/mods/iniFile.js";

const log = createLogger("API:Mods");
const router = express.Router();

// Sync mods from server config
router.post("/sync-from-server", async (req, res) => {
  try {
    // Use direct INI reading (more reliable than serverManager which has path issues)
    const serverConfigPath = await getServerConfigPath();
    const serverName = await getServerName();

    if (!serverConfigPath) {
      log.warn("sync-from-server: Server config path not set");
      return res.json({
        success: false,
        message:
          "Server config path not set. Please configure the server first.",
        synced: 0,
      });
    }

    // Sanitize serverName
    const sanitizedServerName = path.basename(serverName);
    if (
      !sanitizedServerName ||
      sanitizedServerName !== serverName ||
      serverName.includes("..")
    ) {
      return res.status(400).json({ error: "Invalid server name" });
    }

    const iniPath = path.join(serverConfigPath, `${sanitizedServerName}.ini`);
    log.info(`sync-from-server: Looking for config at ${iniPath}`);

    if (!fs.existsSync(iniPath)) {
      log.warn(`sync-from-server: Config file not found at ${iniPath}`);
      return res.json({
        success: false,
        message: `Server config not found at ${iniPath}. Start the server once first.`,
        synced: 0,
      });
    }

    // Read and parse the INI file (normalize CRLF for cross-platform compatibility)
    const content = readTextFile(iniPath);
    const modsMatch = content.match(/^Mods=(.*)$/m);
    const workshopMatch = content.match(/^WorkshopItems=(.*)$/m);

    const modIds = parseIniList(modsMatch?.[1]);
    const workshopIds = parseIniList(workshopMatch?.[1]);

    log.info(
      `sync-from-server: Found ${modIds.length} mod IDs and ${workshopIds.length} workshop IDs`,
    );

    if (workshopIds.length === 0) {
      return res.json({
        success: true,
        message:
          "No mods found in server configuration (WorkshopItems is empty)",
        synced: 0,
      });
    }

    // Query Steam API to identify non-mod items (collections, screenshots, etc.)
    // Real PZ mods have creator_app_id 108600; collections/screenshots use 766 (Steam tools)
    const PZ_APP_ID = 108600;
    const modChecker = req.app.get("modChecker");
    let steamInfo = new Map();
    const nonModTypes = new Set();
    if (modChecker) {
      try {
        steamInfo = await modChecker.fetchSteamTimestamps(workshopIds);
        for (const [id, info] of steamInfo) {
          if (info.creator_app_id && info.creator_app_id !== PZ_APP_ID) {
            nonModTypes.add(id);
            log.info(
              `sync-from-server: Filtering "${info.title || id}" (creator_app_id: ${info.creator_app_id}, not a PZ mod)`,
            );
          }
        }
      } catch (e) {
        log.warn(
          `sync-from-server: Steam API lookup failed, proceeding without type filter: ${e.message}`,
        );
      }
    }

    // Add each workshop ID to tracking
    let synced = 0;
    let skippedIgnored = 0;
    let skippedNonMod = 0;
    for (let i = 0; i < workshopIds.length; i++) {
      try {
        const workshopId = workshopIds[i];
        // Skip non-mod items (collections, screenshots, etc.)
        if (nonModTypes.has(workshopId)) {
          skippedNonMod++;
          continue;
        }
        // Skip mods the user explicitly ignored
        if (await isModIgnored(workshopId)) {
          skippedIgnored++;
          continue;
        }
        // Try to resolve real name from mod.info on disk, fall back to mod ID from INI
        const nameFromDisk = await modChecker?.resolveModNameFromDisk(workshopId);
        // Use Steam API title if available, then disk name, then INI mod ID
        const steamTitle = steamInfo.get(workshopId)?.title;
        const modName =
          steamTitle ||
          nameFromDisk ||
          modIds[i] ||
          `Workshop Mod ${workshopId}`;
        await addTrackedMod(workshopId, modName);
        synced++;
      } catch (e) {
        log.warn(`Failed to sync mod ${workshopIds[i]}: ${e.message}`);
      }
    }

    const parts = [];
    if (skippedIgnored > 0) parts.push(`${skippedIgnored} ignored`);
    if (skippedNonMod > 0)
      parts.push(`${skippedNonMod} non-mod items filtered`);
    const message =
      parts.length > 0
        ? `Synced ${synced} mods from server config (${parts.join(", ")})`
        : `Synced ${synced} mods from server config`;
    res.json({
      success: true,
      message,
      synced,
      skippedIgnored,
      skippedNonMod,
      iniPath,
    });
  } catch (error) {
    log.error(`Failed to sync mods from server: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Clear all update flags
router.post("/clear-updates", async (req, res) => {
  try {
    await clearModUpdates();
    res.json({ success: true, message: "Update flags cleared" });
  } catch (error) {
    log.error(`Failed to clear mod updates: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
