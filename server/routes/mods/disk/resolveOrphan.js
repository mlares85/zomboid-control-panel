import express from "express";
import path from "path";
import { createLogger } from "../../../utils/logger.js";
import { getIgnoredMods } from "../../../database/init.js";
import { sanitizeError, sanitizeIniList, sanitizeModIdList } from "../../../utils/sanitize.js";
import { getServerConfigPath, getServerName, getServerPath } from "../../../utils/mods/serverConfig.js";
import { readTextFile, withIniLock, parseIniList } from "../../../utils/mods/iniFile.js";
import { findAllModIdsFromWorkshop } from "../../../utils/mods/workshopModInfo.js";
import { getWorkshopPaths } from "../../../utils/mods/workshopPaths.js";
import { LocalFiles } from "../../../services/fileAccess/index.js";

const log = createLogger("API:Mods");
const router = express.Router();

// Smart triage for the "Subscribed Workshop items not enabled" diagnostic.
// For each orphan workshop ID (in WorkshopItems= but not loadable via Mods=),
// decide per-ID:
//   - ignored OR folder missing on disk  → drop from WorkshopItems=
//   - folder present on disk             → resolve its mod IDs and add to Mods=
// One INI write for the whole batch. Returns a per-ID breakdown.
router.post("/resolve-orphan-workshop", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const { workshopIds } = req.body || {};
    if (!Array.isArray(workshopIds) || workshopIds.length === 0) {
      return res
        .status(400)
        .json({ error: "workshopIds must be a non-empty array" });
    }
    const cleaned = workshopIds
      .map(String)
      .filter((id) => /^\d{1,15}$/.test(id));
    if (cleaned.length === 0) {
      return res.status(400).json({ error: "No valid workshop IDs provided" });
    }

    const serverConfigPath = await getServerConfigPath();
    const serverName = await getServerName();
    const serverPath = await getServerPath();
    if (!serverConfigPath || !serverName) {
      return res.status(400).json({ error: "Server config path not set" });
    }
    const sanitized = path.basename(serverName);
    if (sanitized !== serverName || serverName.includes("..")) {
      return res.status(400).json({ error: "Invalid server name" });
    }
    const iniPath = path.join(serverConfigPath, `${sanitized}.ini`);
    if (!(await fileAccess.exists(iniPath))) {
      return res.status(404).json({ error: "Server INI not found" });
    }

    const ignoredSet = new Set();
    try {
      for (const m of (await getIgnoredMods()) || []) {
        if (m?.workshop_id) ignoredSet.add(String(m.workshop_id));
      }
    } catch {
      /* best-effort */
    }

    // Classify each orphan.
    const wsToDrop = new Set();
    const modIdsToAdd = new Set();
    const breakdown = [];
    for (const wsId of cleaned) {
      const ignored = ignoredSet.has(wsId);
      let folderExists = false;
      if (serverPath) {
        for (const p of getWorkshopPaths(wsId, serverPath)) {
          if (await fileAccess.exists(p)) {
            folderExists = true;
            break;
          }
        }
      }
      let action;
      const ids =
        folderExists && serverPath
          ? findAllModIdsFromWorkshop(wsId, serverPath)
          : [];

      if (ignored) {
        wsToDrop.add(wsId);
        action = "dropped-ignored";
      } else if (!folderExists) {
        wsToDrop.add(wsId);
        action = "dropped-missing";
      } else if (ids.length === 0) {
        // Folder exists but no readable mod.info — treat as dead.
        wsToDrop.add(wsId);
        action = "dropped-no-mod-info";
      } else {
        for (const m of ids) modIdsToAdd.add(m);
        action = "enabled";
      }
      breakdown.push({ workshopId: wsId, action, modIds: ids });
    }

    // Apply both INI mutations in a single locked write.
    await withIniLock(iniPath, async () => {
      let content = readTextFile(iniPath);

      if (wsToDrop.size > 0) {
        const wsMatch = content.match(/^WorkshopItems=(.*)$/m);
        if (wsMatch) {
          const wsList = parseIniList(wsMatch[1]).filter(
            (id) => !wsToDrop.has(id),
          );
          content = content.replace(
            /^WorkshopItems=.*/m,
            `WorkshopItems=${sanitizeIniList(wsList)}`,
          );
        }
      }

      if (modIdsToAdd.size > 0) {
        const modsMatch = content.match(/^Mods=(.*)$/m);
        const existing = parseIniList(modsMatch?.[1]);
        // Sanitize the EXISTING list (strips mis-pasted workshop IDs that
        // were polluting Mods=), then union with the IDs we just resolved
        // from mod.info. Those are authoritative, so they bypass the
        // numeric-ID filter — some mods legitimately use their workshop ID
        // as their mod ID (e.g. "Tear All Clothes" 3519629457).
        const cleanedExisting = sanitizeModIdList(existing)
          .split(";")
          .filter(Boolean);
        const finalList = [...cleanedExisting];
        for (const m of modIdsToAdd) {
          if (!finalList.includes(m)) finalList.push(m);
        }
        const newLine = `Mods=${sanitizeIniList(finalList)}`;
        content = modsMatch
          ? content.replace(/^Mods=.*/m, newLine)
          : content.trimEnd() + `\n${newLine}\n`;
      }

      await fileAccess.writeFile(iniPath, content, "utf-8");
    });

    const counts = {
      enabled: breakdown.filter((b) => b.action === "enabled").length,
      droppedIgnored: breakdown.filter((b) => b.action === "dropped-ignored")
        .length,
      droppedMissing: breakdown.filter((b) => b.action === "dropped-missing")
        .length,
      droppedNoModInfo: breakdown.filter(
        (b) => b.action === "dropped-no-mod-info",
      ).length,
    };
    log.info(
      `Resolve-orphan-workshop: enabled=${counts.enabled}, droppedIgnored=${counts.droppedIgnored}, droppedMissing=${counts.droppedMissing}, droppedNoModInfo=${counts.droppedNoModInfo} (modIdsAdded=${modIdsToAdd.size}, wsDropped=${wsToDrop.size})`,
    );
    res.json({
      success: true,
      total: cleaned.length,
      counts,
      modIdsAdded: modIdsToAdd.size,
      wsDropped: wsToDrop.size,
      breakdown,
    });
  } catch (error) {
    log.error(`Failed to resolve orphan workshop items: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
