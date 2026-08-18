import express from "express";
import path from "path";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError, sanitizeModIdList, looksLikeWorkshopId } from "../../../utils/sanitize.js";
import { getServerConfigPath, getServerName } from "../../../utils/mods/serverConfig.js";
import { readTextFile, withIniLock } from "../../../utils/mods/iniFile.js";
import { LocalFiles } from "../../../services/fileAccess/index.js";

const log = createLogger("API:Mods");
const router = express.Router();

// Toggle a single mod ID on/off in the Mods= line
router.post("/toggle-mod-id", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const { modId, enabled } = req.body;

    if (!modId || typeof modId !== "string") {
      return res.status(400).json({ error: "modId is required" });
    }
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled (boolean) is required" });
    }
    // Validate modId format — allow any printable characters except INI delimiters
    if (/[\r\n;=]/.test(modId) || modId.length > 200) {
      return res.status(400).json({ error: "Invalid mod ID format" });
    }

    const serverConfigPath = await getServerConfigPath();
    const serverName = await getServerName();

    if (!serverConfigPath) {
      return res.status(400).json({ error: "Server config path not set" });
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
      return res.status(400).json({ error: "Server config file not found" });
    }

    // Reject attempts to ENABLE a workshop-ID-shaped value as a mod ID.
    // (Disabling is still allowed so the Debug "Strip numeric IDs from
    // Mods=" auto-fix can remove existing pollution.)
    if (enabled && looksLikeWorkshopId(modId)) {
      return res.status(400).json({
        error:
          "That looks like a Steam Workshop ID, not a mod ID. Workshop IDs (numeric) belong in WorkshopItems=, not Mods=.",
      });
    }

    const result = await withIniLock(iniPath, async () => {
      let content = readTextFile(iniPath);
      const modsMatch = content.match(/^Mods=(.*)$/m);
      let currentModIds = modsMatch?.[1]?.split(";").filter(Boolean) || [];

      if (enabled) {
        if (!currentModIds.includes(modId)) {
          currentModIds.push(modId);
        }
      } else {
        currentModIds = currentModIds.filter((id) => id !== modId);
      }

      const newModList = sanitizeModIdList(currentModIds);
      if (content.includes("Mods=")) {
        content = content.replace(/^Mods=.*/m, `Mods=${newModList}`);
      } else {
        content += `\nMods=${newModList}`;
      }

      await fileAccess.writeFile(iniPath, content);
      return { totalMods: currentModIds.length };
    });
    log.info(
      `Toggled mod ID "${modId}" ${enabled ? "ON" : "OFF"} in ${iniPath}`,
    );

    res.json({
      success: true,
      modId,
      enabled,
      totalMods: result.totalMods,
    });
  } catch (error) {
    log.error(`Failed to toggle mod ID: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Batch toggle multiple mod IDs on/off in a single INI write
router.post("/batch-toggle-mod-ids", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const { changes } = req.body;

    if (!Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ error: "changes array is required" });
    }
    if (changes.length > 500) {
      return res.status(400).json({ error: "Too many changes (max 500)" });
    }

    // Validate all entries
    for (const change of changes) {
      if (!change.modId || typeof change.modId !== "string") {
        return res
          .status(400)
          .json({ error: "Each change must have a modId string" });
      }
      if (typeof change.enabled !== "boolean") {
        return res
          .status(400)
          .json({ error: "Each change must have an enabled boolean" });
      }
      if (/[\r\n;=]/.test(change.modId) || change.modId.length > 200) {
        return res.status(400).json({
          error: `Invalid mod ID format: ${change.modId.substring(0, 50)}`,
        });
      }
    }

    const serverConfigPath = await getServerConfigPath();
    const serverName = await getServerName();

    if (!serverConfigPath) {
      return res.status(400).json({ error: "Server config path not set" });
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
      return res.status(400).json({ error: "Server config file not found" });
    }

    // Reject batches that try to ENABLE workshop-ID-shaped values. Removal
    // is still allowed (used by the Debug page "Strip numeric IDs" fix).
    const badEnables = changes.filter(
      (c) => c.enabled && looksLikeWorkshopId(c.modId),
    );
    if (badEnables.length > 0) {
      return res.status(400).json({
        error: `Refusing to add ${badEnables.length} workshop-ID-shaped entr${badEnables.length === 1 ? "y" : "ies"} to Mods= (those belong in WorkshopItems=).`,
      });
    }

    const result = await withIniLock(iniPath, async () => {
      let content = readTextFile(iniPath);
      const modsMatch = content.match(/^Mods=(.*)$/m);
      let currentModIds = modsMatch?.[1]?.split(";").filter(Boolean) || [];

      // Apply all changes
      for (const { modId, enabled } of changes) {
        if (enabled) {
          if (!currentModIds.includes(modId)) {
            currentModIds.push(modId);
          }
        } else {
          currentModIds = currentModIds.filter((id) => id !== modId);
        }
      }

      const newModList = sanitizeModIdList(currentModIds);
      if (content.includes("Mods=")) {
        content = content.replace(/^Mods=.*/m, `Mods=${newModList}`);
      } else {
        content += `\nMods=${newModList}`;
      }

      await fileAccess.writeFile(iniPath, content);
      return { totalMods: currentModIds.length };
    });
    log.info(`Batch toggled ${changes.length} mod IDs in ${iniPath}`);

    res.json({
      success: true,
      changesApplied: changes.length,
      totalMods: result.totalMods,
    });
  } catch (error) {
    log.error(`Failed to batch toggle mod IDs: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Deduplicate mod IDs in the Mods= line — removes exact duplicates, keeps one of each
router.post("/deduplicate-mod-ids", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const serverConfigPath = await getServerConfigPath();
    const serverName = await getServerName();

    if (!serverConfigPath) {
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
      const modsMatch = content.match(/^Mods=(.*)$/m);
      const currentMods = modsMatch?.[1]?.split(";").filter(Boolean) || [];

      const seen = new Map();
      const deduped = [];
      const removed = [];
      for (const modId of currentMods) {
        const count = (seen.get(modId) || 0) + 1;
        seen.set(modId, count);
        if (count === 1) {
          deduped.push(modId);
        } else {
          removed.push(modId);
        }
      }

      if (removed.length === 0) {
        return { noChanges: true, deduped };
      }

      content = content.replace(
        /^Mods=.*/m,
        `Mods=${sanitizeModIdList(deduped)}`,
      );
      await fileAccess.writeFile(iniPath, content);
      return { noChanges: false, removed, deduped };
    });

    if (lockResult.noChanges) {
      return res.json({
        success: true,
        removed: [],
        remaining: lockResult.deduped.length,
        message: "No duplicate mod IDs found. No changes needed.",
      });
    }

    const uniqueDupes = [...new Set(lockResult.removed)];
    log.info(
      `Deduplicated Mods= line: removed ${lockResult.removed.length} duplicate entries (${uniqueDupes.length} unique mod IDs: ${uniqueDupes.join(", ")})`,
    );

    res.json({
      success: true,
      removed: uniqueDupes,
      removedCount: lockResult.removed.length,
      uniqueCount: uniqueDupes.length,
      remaining: lockResult.deduped.length,
      message: `Removed ${lockResult.removed.length} duplicate mod ID${lockResult.removed.length !== 1 ? "s" : ""}: ${uniqueDupes.join(", ")}`,
    });
  } catch (error) {
    log.error(`Failed to deduplicate mod IDs: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
