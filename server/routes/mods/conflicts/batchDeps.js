import express from "express";
import path from "path";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError, sanitizeModIdList } from "../../../utils/sanitize.js";
import { getServerConfigPath, getServerName, getServerPath } from "../../../utils/mods/serverConfig.js";
import { readTextFile, withIniLock } from "../../../utils/mods/iniFile.js";
import { findMapFoldersFromWorkshop } from "../../../utils/mods/workshopPaths.js";
import { findModIdFromWorkshop } from "../../../utils/mods/workshopModInfo.js";
import { fetchModIdFromWorkshop } from "../../../utils/mods/workshopFetch.js";
import { LocalFiles } from "../../../services/fileAccess/index.js";

const log = createLogger("API:Mods");
const router = express.Router();

// ─── Missing Dependencies: Batch add all resolved deps ──────────────────────
router.post("/add-all-resolved-deps", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const { deps } = req.body;
    if (!deps || !Array.isArray(deps) || deps.length === 0) {
      return res.status(400).json({ error: "No dependencies provided" });
    }
    if (deps.length > 200) {
      return res
        .status(400)
        .json({ error: "Too many dependencies in one request (max 200)" });
    }

    // Validate all workshop IDs
    for (const dep of deps) {
      if (!dep.workshopId || !/^\d{1,15}$/.test(String(dep.workshopId))) {
        return res.status(400).json({
          error: `Invalid Workshop ID: ${String(dep.workshopId).substring(0, 20)}`,
        });
      }
    }

    const serverConfigPath = await getServerConfigPath();
    const serverName = await getServerName();
    const serverPath = await getServerPath();
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

    // Pre-resolve all mod IDs BEFORE taking the lock (async ops)
    const resolvedDeps = [];
    for (const dep of deps) {
      const wsId = String(dep.workshopId);
      let modId = dep.modId || null;
      if (!modId && serverPath) modId = findModIdFromWorkshop(wsId, serverPath);
      if (!modId) {
        try {
          modId = await fetchModIdFromWorkshop(wsId);
        } catch (e) {
          log.debug(`fetchModIdFromWorkshop failed for ${wsId}: ${e.message}`);
        }
      }
      const mapFolders = serverPath
        ? findMapFoldersFromWorkshop(wsId, serverPath)
        : [];
      resolvedDeps.push({ wsId, modId, mapFolders });
    }

    // Atomically read-modify-write inside the lock
    const lockResult = await withIniLock(iniPath, async () => {
      let content = readTextFile(iniPath);
      const wsMatch = content.match(/^WorkshopItems=(.*)$/m);
      const currentWs = new Set(wsMatch?.[1]?.split(";").filter(Boolean) || []);
      const modsMatch = content.match(/^Mods=(.*)$/m);
      const currentMods = new Set(
        modsMatch?.[1]?.split(";").filter(Boolean) || [],
      );
      const mapMatch = content.match(/^Map=(.*)$/m);
      const currentMaps = mapMatch?.[1]?.split(";").filter(Boolean) || [];

      let wsAdded = 0,
        modIdsAdded = 0;
      const allMapFolders = [];

      for (const { wsId, modId, mapFolders } of resolvedDeps) {
        if (!currentWs.has(wsId)) {
          currentWs.add(wsId);
          wsAdded++;
        }
        if (modId && !currentMods.has(modId)) {
          currentMods.add(modId);
          modIdsAdded++;
        }
        for (const f of mapFolders) {
          if (!currentMaps.includes(f)) {
            currentMaps.unshift(f);
            allMapFolders.push(f);
          }
        }
      }

      const wsLine = Array.from(currentWs).join(";");
      const modsLine = sanitizeModIdList(Array.from(currentMods));
      const mapLine = currentMaps.join(";");

      if (content.includes("WorkshopItems="))
        content = content.replace(
          /^WorkshopItems=.*/m,
          `WorkshopItems=${wsLine}`,
        );
      else content += `\nWorkshopItems=${wsLine}`;
      if (content.includes("Mods="))
        content = content.replace(/^Mods=.*/m, `Mods=${modsLine}`);
      else content += `\nMods=${modsLine}`;
      if (allMapFolders.length > 0) {
        if (content.includes("Map="))
          content = content.replace(/^Map=.*/m, `Map=${mapLine}`);
        else content += `\nMap=${mapLine}`;
      }

      await fileAccess.writeFile(iniPath, content, "utf-8");
      return { wsAdded, modIdsAdded, allMapFolders };
    });

    log.info(
      `Batch added ${deps.length} missing deps: ${lockResult.wsAdded} ws IDs, ${lockResult.modIdsAdded} mod IDs`,
    );

    res.json({
      success: true,
      total: deps.length,
      wsAdded: lockResult.wsAdded,
      modIdsAdded: lockResult.modIdsAdded,
      mapFolders: lockResult.allMapFolders,
      message: `Added ${deps.length} dependencies to server config.`,
    });
  } catch (error) {
    log.error(`Failed to batch add deps: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
