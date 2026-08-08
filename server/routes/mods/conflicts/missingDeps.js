import express from "express";
import path from "path";
import fs from "fs";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError, sanitizeModIdList } from "../../../utils/sanitize.js";
import { getServerConfigPath, getServerName, getServerPath } from "../../../utils/mods/serverConfig.js";
import { readTextFile, withIniLock } from "../../../utils/mods/iniFile.js";
import { findMapFoldersFromWorkshop } from "../../../utils/mods/workshopPaths.js";
import { fetchModIdFromWorkshop } from "../../../utils/mods/workshopFetch.js";
import { findModIdFromWorkshop, getModDetailsFromWorkshop } from "../../../utils/mods/workshopModInfo.js";

const log = createLogger("API:Mods");
const router = express.Router();

// ─── Missing Dependencies: Add a resolved dependency to INI ─────────────────
router.post("/add-missing-dep", async (req, res) => {
  try {
    const { workshopId, modId } = req.body;
    if (!workshopId || !/^\d{1,15}$/.test(String(workshopId))) {
      return res.status(400).json({ error: "Valid Workshop ID is required" });
    }
    // Sanitize modId — only allow safe characters
    const modIdStr = modId ? String(modId) : null;
    if (modIdStr && !/^[\w.\-]{1,200}$/.test(modIdStr)) {
      return res.status(400).json({ error: "Invalid mod ID format" });
    }

    const serverConfigPath = await getServerConfigPath();
    const serverName = await getServerName();
    const serverPath = await getServerPath();
    if (!serverConfigPath)
      return res.status(400).json({ error: "Server path not configured." });

    const sanitizedServerName = path.basename(serverName);
    if (
      !sanitizedServerName ||
      sanitizedServerName !== serverName ||
      serverName.includes("..")
    ) {
      return res.status(400).json({ error: "Invalid server name" });
    }
    const iniPath = path.join(serverConfigPath, `${sanitizedServerName}.ini`);
    if (!fs.existsSync(iniPath)) {
      return res.status(400).json({ error: "Server config file not found" });
    }

    // Do async detection work BEFORE taking the lock
    const wsIdStr = String(workshopId);
    let resolvedModId = modIdStr;
    if (!resolvedModId && serverPath) {
      resolvedModId = findModIdFromWorkshop(wsIdStr, serverPath);
    }
    if (!resolvedModId) {
      resolvedModId = await fetchModIdFromWorkshop(wsIdStr);
    }

    // Detect map folders (sync disk reads, no INI dependency)
    const mapFolders = serverPath
      ? findMapFoldersFromWorkshop(wsIdStr, serverPath)
      : [];

    // Atomically read-modify-write inside the lock
    const lockResult = await withIniLock(iniPath, () => {
      let content = readTextFile(iniPath);

      // Add to WorkshopItems if not present
      const wsMatch = content.match(/^WorkshopItems=(.*)$/m);
      const currentWs = wsMatch?.[1]?.split(";").filter(Boolean) || [];
      let wsAdded = false;
      if (!currentWs.includes(wsIdStr)) {
        currentWs.push(wsIdStr);
        if (content.includes("WorkshopItems=")) {
          content = content.replace(
            /^WorkshopItems=.*/m,
            `WorkshopItems=${currentWs.join(";")}`,
          );
        } else {
          content += `\nWorkshopItems=${currentWs.join(";")}`;
        }
        wsAdded = true;
      }

      // Add to Mods if we have a mod ID and it's not present
      let modIdAdded = false;
      if (resolvedModId) {
        const modsMatch = content.match(/^Mods=(.*)$/m);
        const currentMods = modsMatch?.[1]?.split(";").filter(Boolean) || [];
        if (!currentMods.includes(resolvedModId)) {
          currentMods.push(resolvedModId);
          if (content.includes("Mods=")) {
            content = content.replace(
              /^Mods=.*/m,
              `Mods=${sanitizeModIdList(currentMods)}`,
            );
          } else {
            content += `\nMods=${sanitizeModIdList(currentMods)}`;
          }
          modIdAdded = true;
        }
      }

      // Auto-detect map folders
      if (mapFolders.length > 0) {
        const mapMatch = content.match(/^Map=(.*)$/m);
        const currentMaps = mapMatch?.[1]?.split(";").filter(Boolean) || [];
        let mapsChanged = false;
        for (const f of mapFolders) {
          if (!currentMaps.includes(f)) {
            currentMaps.unshift(f);
            mapsChanged = true;
          }
        }
        if (mapsChanged) {
          if (content.includes("Map="))
            content = content.replace(
              /^Map=.*/m,
              `Map=${currentMaps.join(";")}`,
            );
          else content += `\nMap=${currentMaps.join(";")}`;
        }
      }

      fs.writeFileSync(iniPath, content, "utf-8");
      return { wsAdded, modIdAdded };
    });

    log.info(
      `Added missing dep: workshop ${wsIdStr}, modId ${resolvedModId || "(unknown)"}`,
    );

    res.json({
      success: true,
      workshopId: wsIdStr,
      modId: resolvedModId,
      wsAdded: lockResult.wsAdded,
      modIdAdded: lockResult.modIdAdded,
      mapFolders,
      message: `Added ${resolvedModId || wsIdStr} to server config.${mapFolders.length > 0 ? ` Map folders: ${mapFolders.join(", ")}` : ""}`,
    });
  } catch (error) {
    log.error(`Failed to add missing dep: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// ─── Missing Dependencies: Auto-resolve all unresolved deps ─────────────────
router.post("/resolve-missing-deps", async (req, res) => {
  try {
    const { deps } = req.body;
    if (!deps || !Array.isArray(deps)) {
      return res.status(400).json({ error: "Dependencies array is required" });
    }

    const serverPath = await getServerPath();
    const resolved = [];

    for (const dep of deps) {
      const missingDep = dep.missingDep;
      if (!missingDep || typeof missingDep !== "string") continue;
      if (dep.resolvedWorkshopId) {
        resolved.push(dep);
        continue;
      }

      // Search locally
      let found = false;
      if (serverPath) {
        const workshopPaths = [
          path.join(serverPath, "steamapps", "workshop", "content", "108600"),
          path.join(
            serverPath,
            "..",
            "steamapps",
            "workshop",
            "content",
            "108600",
          ),
        ];
        for (const workshopBase of workshopPaths) {
          if (found || !fs.existsSync(workshopBase)) continue;
          try {
            for (const entry of fs.readdirSync(workshopBase, {
              withFileTypes: true,
            })) {
              if (!entry.isDirectory() || found) continue;
              try {
                const details = getModDetailsFromWorkshop(
                  entry.name,
                  serverPath,
                );
                for (const mod of details) {
                  if (mod.id === missingDep) {
                    resolved.push({
                      ...dep,
                      resolvedWorkshopId: entry.name,
                      resolvedModName: mod.name,
                    });
                    found = true;
                    break;
                  }
                }
              } catch (e) {
                log.debug(
                  `Error reading mod details during dep resolution: ${e.message}`,
                );
              }
            }
          } catch (e) {
            log.debug(
              `Error reading workshop path during dep scan: ${e.message}`,
            );
          }
        }
      }
      if (!found) resolved.push(dep);
    }

    res.json({
      success: true,
      deps: resolved,
      resolvedCount: resolved.filter((d) => d.resolvedWorkshopId).length,
    });
  } catch (error) {
    log.error(`Failed to resolve missing deps: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
