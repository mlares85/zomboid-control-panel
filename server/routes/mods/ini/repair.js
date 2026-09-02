import express from "express";
import path from "path";
import { createLogger } from "../../../utils/logger.js";
import { LocalFiles } from "../../../services/fileAccess/index.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import { getServerConfigPath, getServerName, getServerPath } from "../../../utils/mods/serverConfig.js";
import { readTextFile, withIniLock, parseIniList } from "../../../utils/mods/iniFile.js";
import { findMapFoldersFromWorkshop } from "../../../utils/mods/workshopPaths.js";

const log = createLogger("API:Mods");
const router = express.Router();

// Repair Map= entries - validates each entry has actual map data on disk and removes invalid ones
router.post("/repair-map-entries", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const serverConfigPath = await getServerConfigPath();
    const serverPath = await getServerPath();
    const serverName = await getServerName();

    if (!serverConfigPath || !serverPath) {
      return res.status(400).json({
        error: "Server path not configured.",
        detail: "Set the server install path in Servers > Edit.",
        fixUrl: "/servers",
      });
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
      return res.status(400).json({ error: "Server config file not found." });
    }

    // Atomically read-modify-write inside the lock
    const lockResult = await withIniLock(iniPath, async () => {
      let content = readTextFile(iniPath);
      const mapMatch = content.match(/^Map=(.*)$/m);
      const currentMaps = mapMatch?.[1]?.split(";").filter(Boolean) || [];

      const workshopMatch = content.match(/^WorkshopItems=(.*)$/m);
      const workshopIds = parseIniList(workshopMatch?.[1]);

      const validMapFolders = new Set();
      for (const wsId of workshopIds) {
        const folders = findMapFoldersFromWorkshop(wsId, serverPath);
        for (const f of folders) validMapFolders.add(f);
      }
      validMapFolders.add("Muldraugh, KY");

      const validEntries = [];
      const removedEntries = [];
      for (const entry of currentMaps) {
        if (
          validMapFolders.has(entry) ||
          entry.includes("Muldraugh") ||
          entry.includes("West Point") ||
          entry.includes("Riverside") ||
          entry.includes("Rosewood") ||
          entry.includes("March Ridge") ||
          entry.includes("Louisville")
        ) {
          validEntries.push(entry);
        } else {
          removedEntries.push(entry);
        }
      }

      const addedEntries = [];
      for (const folder of validMapFolders) {
        if (folder === "Muldraugh, KY") continue;
        if (!validEntries.includes(folder)) {
          const mulIdx = validEntries.findIndex((e) => e.includes("Muldraugh"));
          if (mulIdx >= 0) {
            validEntries.splice(mulIdx, 0, folder);
          } else {
            validEntries.push(folder);
          }
          addedEntries.push(folder);
        }
      }

      if (!validEntries.some((e) => e.includes("Muldraugh"))) {
        validEntries.push("Muldraugh, KY");
      }

      if (removedEntries.length > 0 || addedEntries.length > 0) {
        const newMapLine = validEntries.join(";");
        if (content.includes("Map=")) {
          content = content.replace(/^Map=.*/m, `Map=${newMapLine}`);
        }
        await fileAccess.writeFile(iniPath, content);
        log.info(
          `Repaired Map= entries: removed ${removedEntries.length} invalid, added ${addedEntries.length} missing`,
        );
        if (removedEntries.length > 0)
          log.info(`  Removed: ${removedEntries.join(", ")}`);
        if (addedEntries.length > 0)
          log.info(`  Added: ${addedEntries.join(", ")}`);
      }

      return { removedEntries, addedEntries, validEntries };
    });

    const parts = [];
    if (lockResult.removedEntries.length > 0)
      parts.push(
        `Removed ${lockResult.removedEntries.length} invalid: ${lockResult.removedEntries.join(", ")}`,
      );
    if (lockResult.addedEntries.length > 0)
      parts.push(
        `Added ${lockResult.addedEntries.length} missing: ${lockResult.addedEntries.join(", ")}`,
      );

    res.json({
      success: true,
      removed: lockResult.removedEntries,
      added: lockResult.addedEntries,
      remaining: lockResult.validEntries,
      message:
        parts.length > 0
          ? parts.join(". ")
          : "All map entries are valid. No changes needed.",
    });
  } catch (error) {
    log.error(`Failed to repair map entries: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
