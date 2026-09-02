import path from "path";
import fs from "fs";
import { createLogger } from "../logger.js";
import { sanitizeIniList, sanitizeModIdList } from "../sanitize.js";
import { getServerConfigPath, getServerName, getServerPath } from "./serverConfig.js";
import { readTextFile, withIniLock, parseIniList } from "./iniFile.js";
import { findAllModIdsFromWorkshop } from "./workshopModInfo.js";
import { findMapFoldersFromWorkshop, getWorkshopPaths } from "./workshopPaths.js";

const log = createLogger("API:Mods");

// Deletes the workshop content folder, then strips the workshop ID, its
// mod-folder IDs and its map folders from the server INI so the server stops
// loading it. Returns iniEditApplied=false when the config file could not be
// reached — callers must not ignore-list in that case, because the mod may
// still be live in Mods=/WorkshopItems=.
export async function deleteModFromDiskAndIni(wsId) {
  const serverConfigPath = await getServerConfigPath();
  const serverName = await getServerName();
  const serverPath = await getServerPath();
  const sanitized = serverName ? path.basename(serverName) : null;
  const iniPath =
    sanitized && serverConfigPath
      ? path.join(serverConfigPath, `${sanitized}.ini`)
      : null;

  // Capture mod IDs and map folders BEFORE we delete the folder — both are
  // read off the files we are about to remove.
  const modIdsToStrip = serverPath
    ? findAllModIdsFromWorkshop(wsId, serverPath)
    : [];
  const mapFoldersToStrip = serverPath
    ? findMapFoldersFromWorkshop(wsId, serverPath)
    : [];

  const possiblePaths = getWorkshopPaths(wsId, serverPath || "");
  let removedPath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        fs.rmSync(p, { recursive: true, force: true });
        removedPath = p;
        break;
      } catch (e) {
        log.warn(`Failed to delete workshop folder ${p}: ${e.message}`);
      }
    }
  }

  let iniEditApplied = false;
  if (iniPath && fs.existsSync(iniPath)) {
    iniEditApplied = true;
    await withIniLock(iniPath, () => {
      let content = readTextFile(iniPath);
      const wsMatch = content.match(/^WorkshopItems=(.*)$/m);
      if (wsMatch) {
        const wsList = parseIniList(wsMatch[1]).filter((id) => id !== wsId);
        content = content.replace(
          /^WorkshopItems=.*/m,
          `WorkshopItems=${sanitizeIniList(wsList)}`,
        );
      }
      const modsMatch = content.match(/^Mods=(.*)$/m);
      if (modsMatch && modIdsToStrip.length > 0) {
        const modsList = parseIniList(modsMatch[1]).filter(
          (id) => !modIdsToStrip.includes(id),
        );
        content = content.replace(
          /^Mods=.*/m,
          `Mods=${sanitizeModIdList(modsList)}`,
        );
      }
      const mapMatch = content.match(/^Map=(.*)$/m);
      if (mapMatch && mapFoldersToStrip.length > 0) {
        let mapList = mapMatch[1]
          .split(";")
          .filter(Boolean)
          .filter((m) => !mapFoldersToStrip.includes(m));
        if (mapList.length === 0) mapList = ["Muldraugh, KY"];
        content = content.replace(/^Map=.*/m, `Map=${sanitizeIniList(mapList)}`);
      }
      fs.writeFileSync(iniPath, content, "utf-8");
    });
  }

  return { removedPath, modIdsToStrip, mapFoldersToStrip, iniEditApplied };
}
