// World/save wipe: destructive execution (see wipePreview.js for the dry-run).
import path from "path";
import { createLogger } from "../../utils/logger.js";
import { logServerEvent } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { requireRole } from "../../services/auth.js";
import {
  SAVE_TARGETS,
  ALLOWED_TARGETS,
  MAP_DIRS,
  WORLD_DIRS,
  PLAYER_ROOT_FILES,
  WORLD_ROOT_FILES,
} from "./wipeShared.js";
import { registerWipePreviewRoute } from "./wipePreview.js";
import { LocalFiles } from "../../services/fileAccess/index.js";

const log = createLogger("API:Server");

// Guard against concurrent wipe operations
let wipeInProgress = false;

export function registerWipeRoutes(router) {
  registerWipePreviewRoute(router);
  registerWipeRoute(router);
}

function registerWipeRoute(router) {
  // Execute server wipe
  router.post("/wipe", requireRole("admin"), async (req, res) => {
    // Claim the guard before the first await: awaiting between the check and the
    // assignment lets a second concurrent request pass the check and run a
    // parallel destructive wipe of the same save directory.
    if (wipeInProgress) {
      return res.status(409).json({
        error: "A wipe operation is already in progress. Please wait.",
      });
    }
    wipeInProgress = true;

    try {
      const fileAccess = new LocalFiles();
      const serverManager = req.app.get("serverManager");
      await serverManager.loadConfig();

      // Safety: server must be stopped
      const isRunning = await serverManager.checkServerRunning();
      if (isRunning) {
        return res.status(400).json({
          error: "Server must be stopped before wiping. Stop the server first.",
        });
      }

      const { targets, confirm } = req.body;
      if (confirm !== true) {
        return res.status(400).json({ error: "Wipe requires confirm: true" });
      }
      if (!Array.isArray(targets) || targets.length === 0) {
        return res.status(400).json({
          error:
            "targets must be a non-empty array of: map, players, world, accounts",
        });
      }

      const invalid = targets.filter((t) => !ALLOWED_TARGETS.includes(t));
      if (invalid.length > 0) {
        return res
          .status(400)
          .json({ error: `Invalid targets: ${invalid.join(", ")}` });
      }

      const savePath = serverManager.savePath;
      const serverName = serverManager.serverName || "servertest";
      if (!savePath) {
        return res.status(400).json({ error: "No zomboid data path configured" });
      }
      if (/[/\\]/.test(serverName)) {
        return res.status(400).json({ error: "Invalid server name" });
      }

      const saveDir = path.join(savePath, "Saves", "Multiplayer", serverName);
      if (!(await fileAccess.exists(saveDir))) {
        return res
          .status(404)
          .json({ error: `Save directory not found: ${serverName}` });
      }

      // Path traversal safety
      const normalizedSaveDir = path.normalize(saveDir);
      if (normalizedSaveDir.includes("..")) {
        return res.status(400).json({ error: "Invalid path" });
      }

      const results = {};

      try {
        if (targets.includes("map")) {
          let deletedCount = 0;
          for (const dirName of MAP_DIRS) {
            const dir = path.join(saveDir, dirName);
            if (await fileAccess.exists(dir)) {
              log.warn(`WIPE: Deleting ${dirName}/ at ${dir}`);
              await fileAccess.rm(dir, { recursive: true, force: true });
              deletedCount++;
            }
          }
          results.map =
            deletedCount > 0
              ? `deleted ${deletedCount} directories`
              : "not found";
        }

        if (targets.includes("players")) {
          let deletedCount = 0;
          try {
            const rootEntries = await fileAccess.readdir(saveDir, { withFileTypes: true });
            for (const entry of rootEntries) {
              if (!entry.isDirectory && PLAYER_ROOT_FILES.test(entry.name)) {
                log.warn(`WIPE: Deleting player file ${entry.name}`);
                await fileAccess.unlink(path.join(saveDir, entry.name));
                deletedCount++;
              }
            }
          } catch (e) {
            log.warn(`WIPE: Failed to clean player files: ${e.message}`);
          }
          results.players =
            deletedCount > 0 ? `deleted ${deletedCount} files` : "not found";
        }

        if (targets.includes("world")) {
          let deletedCount = 0;
          // Delete world directories
          for (const dirName of WORLD_DIRS) {
            const dir = path.join(saveDir, dirName);
            if (await fileAccess.exists(dir)) {
              log.warn(`WIPE: Deleting ${dirName}/ at ${dir}`);
              await fileAccess.rm(dir, { recursive: true, force: true });
              deletedCount++;
            }
          }
          // Delete world root files
          try {
            const rootEntries = await fileAccess.readdir(saveDir, { withFileTypes: true });
            for (const entry of rootEntries) {
              if (!entry.isDirectory && WORLD_ROOT_FILES.test(entry.name)) {
                log.warn(`WIPE: Deleting world file ${entry.name}`);
                await fileAccess.unlink(path.join(saveDir, entry.name));
                deletedCount++;
              }
            }
          } catch (e) {
            log.warn(`WIPE: Failed to clean world files: ${e.message}`);
          }
          results.world =
            deletedCount > 0 ? `deleted ${deletedCount} items` : "not found";
        }

        // Selecting every target means a total wipe: remove whatever the
        // per-target lists don't recognise so nothing from the old world survives.
        if (SAVE_TARGETS.every((t) => targets.includes(t))) {
          let leftovers = 0;
          for (const entry of await fileAccess.readdir(saveDir, { withFileTypes: true })) {
            log.warn(`WIPE: Deleting leftover ${entry.name}`);
            await fileAccess.rm(path.join(saveDir, entry.name), {
              recursive: true,
              force: true,
            });
            leftovers++;
          }
          results.leftovers =
            leftovers > 0 ? `deleted ${leftovers} remaining items` : "none";
        }

        if (targets.includes("accounts")) {
          let deletedCount = 0;
          for (const suffix of ["", "-journal", "-wal", "-shm"]) {
            const dbFile = path.join(savePath, "db", `${serverName}.db${suffix}`);
            if (await fileAccess.exists(dbFile)) {
              log.warn(`WIPE: Deleting account database ${dbFile}`);
              await fileAccess.rm(dbFile, { force: true });
              deletedCount++;
            }
          }
          results.accounts =
            deletedCount > 0 ? `deleted ${deletedCount} files` : "not found";
        }
      } finally {
        wipeInProgress = false;
      }

      log.warn(
        `WIPE COMPLETE: server=${serverName}, targets=${targets.join(",")}, results=${JSON.stringify(results)}`,
      );
      await logServerEvent("wipe", `Server wiped: ${targets.join(", ")}`, {
        targets,
        results,
      });

      res.json({
        success: true,
        serverName,
        targets,
        results,
        message: `Server "${serverName}" wiped: ${targets.join(", ")}`,
      });
    } catch (error) {
      log.error(`Wipe failed: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    } finally {
      wipeInProgress = false;
    }
  });
}
