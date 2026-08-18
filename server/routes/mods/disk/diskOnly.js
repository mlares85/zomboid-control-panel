import express from "express";
import path from "path";
import { createLogger } from "../../../utils/logger.js";
import { getIgnoredMods, removeIgnoredMod } from "../../../database/init.js";
import { sanitizeError, sanitizeIniList, sanitizeModIdList } from "../../../utils/sanitize.js";
import { getServerConfigPath, getServerName, getServerPath } from "../../../utils/mods/serverConfig.js";
import { readTextFile, withIniLock } from "../../../utils/mods/iniFile.js";
import { findAllModIdsFromWorkshop } from "../../../utils/mods/workshopModInfo.js";
import { LocalFiles } from "../../../services/fileAccess/index.js";

const log = createLogger("API:Mods");
const router = express.Router();

// ─── Disk-only mods ─────────────────────────────────────────────────────────
// Returns workshop IDs that exist on disk (downloaded into the Steam workshop
// content folder) but are NOT in the server's INI WorkshopItems= list.
// These are "installed but disabled" mods — the user has the files, but the
// server isn't loading them. The UI shows these as greyed-out rows behind a
// "Show disabled" toggle, with a quick Enable action.
router.get("/disk-only", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const modChecker = req.app.get("modChecker");
    if (!modChecker || !modChecker.workshopAcfPath) {
      return res.json({ mods: [], reason: "workshop folder not configured" });
    }

    // Read INI to know what's currently enabled.
    const serverConfigPath = await getServerConfigPath();
    const serverName = await getServerName();
    const inIni = new Set();
    if (serverConfigPath && serverName) {
      const sanitized = path.basename(serverName);
      if (sanitized === serverName && !serverName.includes("..")) {
        const iniPath = path.join(serverConfigPath, `${sanitized}.ini`);
        if (await fileAccess.exists(iniPath)) {
          const content = readTextFile(iniPath);
          const m = content.match(/^WorkshopItems=(.*)$/m);
          for (const id of m?.[1]?.split(";").filter(Boolean) || [])
            inIni.add(id);
        }
      }
    }

    // Mods the user has explicitly ignored are shown in their own panel and
    // shouldn't pollute the disabled-on-disk list (otherwise the same row
    // appears twice in the UI).
    const ignored = new Set();
    try {
      for (const m of (await getIgnoredMods()) || []) {
        if (m?.workshop_id) ignored.add(String(m.workshop_id));
      }
    } catch {
      /* best-effort */
    }

    // Enumerate the steamapps/workshop/content/108600 folder for the active server.
    const workshopDir = path.dirname(modChecker.workshopAcfPath);
    const contentDir = path.join(workshopDir, "content", "108600");
    if (!(await fileAccess.exists(contentDir))) {
      return res.json({ mods: [], reason: "no workshop content folder" });
    }

    let entries = [];
    try {
      entries = await fileAccess.readdir(contentDir, { withFileTypes: true });
    } catch (e) {
      log.warn(`disk-only: failed to read ${contentDir}: ${e.message}`);
      return res.json({ mods: [], reason: "cannot read workshop folder" });
    }

    const mods = [];
    for (const entry of entries) {
      if (!entry.isDirectory) continue;
      const wsId = entry.name;
      if (!/^\d{1,15}$/.test(wsId)) continue;
      if (inIni.has(wsId)) continue; // already enabled in INI
      if (ignored.has(wsId)) continue; // user explicitly ignored — shown in the Ignored panel instead
      const name =
        (await modChecker.resolveModNameFromDisk(wsId)) ||
        `Workshop Mod ${wsId}`;
      mods.push({ workshop_id: wsId, name });
    }

    res.json({ mods });
  } catch (error) {
    log.error(`Failed to list disk-only mods: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Enable a disk-only mod: append its workshop ID to the INI WorkshopItems=
// list (and best-effort the corresponding mod IDs to Mods=) so the server
// loads it on next start. This is the inverse of the existing batch-remove.
router.post("/enable-disk-mod", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const { workshopId } = req.body || {};
    const wsId = String(workshopId || "");
    if (!/^\d{1,15}$/.test(wsId)) {
      return res.status(400).json({ error: "Invalid workshop ID" });
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

    // Resolve mod folder IDs (Mods= entries) from the workshop folder so the
    // server can actually load it. A workshop item can ship multiple mods.
    const modIdsToAdd = serverPath
      ? findAllModIdsFromWorkshop(wsId, serverPath)
      : [];

    await withIniLock(iniPath, async () => {
      let content = readTextFile(iniPath);

      // WorkshopItems
      const wsMatch = content.match(/^WorkshopItems=(.*)$/m);
      const wsList = wsMatch?.[1]?.split(";").filter(Boolean) || [];
      if (!wsList.includes(wsId)) wsList.push(wsId);
      const wsLine = `WorkshopItems=${sanitizeIniList(wsList)}`;
      content = wsMatch
        ? content.replace(/^WorkshopItems=.*/m, wsLine)
        : content.trimEnd() + `\n${wsLine}\n`;

      // Mods
      const modsMatch = content.match(/^Mods=(.*)$/m);
      const existing = modsMatch?.[1]?.split(";").filter(Boolean) || [];
      // Sanitize existing entries (strips mis-pasted workshop IDs), then
      // union with mod.info-verified IDs — those are authoritative so they
      // bypass the numeric-ID filter (some mods use their workshop ID as
      // their mod ID, e.g. "Tear All Clothes" 3519629457).
      const cleanedExisting = sanitizeModIdList(existing)
        .split(";")
        .filter(Boolean);
      const modsList = [...cleanedExisting];
      for (const mid of modIdsToAdd) {
        if (!modsList.includes(mid)) modsList.push(mid);
      }
      const modsLine = `Mods=${sanitizeIniList(modsList)}`;
      content = modsMatch
        ? content.replace(/^Mods=.*/m, modsLine)
        : content.trimEnd() + `\n${modsLine}\n`;

      await fileAccess.writeFile(iniPath, content, "utf-8");
    });

    // Lift any prior ignore-list entry so auto-track picks it up.
    try {
      await removeIgnoredMod(wsId);
    } catch {
      /* best-effort */
    }

    log.info(
      `Enabled disk-only mod ${wsId} (added ${modIdsToAdd.length} mod IDs)`,
    );
    res.json({
      success: true,
      workshopId: wsId,
      modIdsAdded: modIdsToAdd.length,
    });
  } catch (error) {
    log.error(`Failed to enable disk-only mod: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
