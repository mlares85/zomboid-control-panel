// Dry-run preview of what POST /wipe would delete.
import path from "path";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";
import {
  SAVE_TARGETS,
  ALLOWED_TARGETS,
  MAP_DIRS,
  WORLD_DIRS,
  PLAYER_ROOT_FILES,
  WORLD_ROOT_FILES,
  countDir,
} from "./wipeShared.js";
import { LocalFiles } from "../../services/fileAccess/index.js";

const log = createLogger("API:Server");

export function registerWipePreviewRoute(router) {
  router.post("/wipe/preview", async (req, res) => {
    try {
      const fileAccess = new LocalFiles();
      const serverManager = req.app.get("serverManager");
      await serverManager.loadConfig();

      const { targets } = req.body; // e.g. ["map", "players", "world"]
      if (!Array.isArray(targets) || targets.length === 0) {
        return res.status(400).json({
          error:
            "targets must be a non-empty array of: map, players, world, accounts",
        });
      }

      const invalid = targets.filter((t) => !ALLOWED_TARGETS.includes(t));
      if (invalid.length > 0) {
        return res.status(400).json({
          error: `Invalid targets: ${invalid.join(", ")}. Allowed: ${ALLOWED_TARGETS.join(", ")}`,
        });
      }

      const savePath = serverManager.savePath;
      const serverName = serverManager.serverName || "servertest";
      if (!savePath) {
        return res.status(400).json({ error: "No zomboid data path configured" });
      }
      // Reject server names with path separators
      if (/[/\\]/.test(serverName)) {
        return res.status(400).json({ error: "Invalid server name" });
      }

      const saveDir = path.join(savePath, "Saves", "Multiplayer", serverName);
      if (!(await fileAccess.exists(saveDir))) {
        return res
          .status(404)
          .json({ error: `Save directory not found: ${serverName}` });
      }

      const preview = {};
      let totalFiles = 0;
      let totalSize = 0;

      if (targets.includes("map")) {
        let mapFiles = 0;
        let mapSize = 0;
        for (const dirName of MAP_DIRS) {
          const dir = path.join(saveDir, dirName);
          if (await fileAccess.exists(dir)) {
            const sub = await countDir(dir);
            mapFiles += sub.files;
            mapSize += sub.size;
          }
        }
        preview.map = { files: mapFiles, size: mapSize };
        totalFiles += mapFiles;
        totalSize += mapSize;
      }

      if (targets.includes("players")) {
        let playerFiles = 0;
        let playerSize = 0;
        try {
          const rootEntries = await fileAccess.readdir(saveDir, { withFileTypes: true });
          for (const entry of rootEntries) {
            if (!entry.isDirectory && PLAYER_ROOT_FILES.test(entry.name)) {
              playerFiles++;
              try {
                const stat = await fileAccess.stat(path.join(saveDir, entry.name));
                if (stat) playerSize += stat.size;
              } catch (e) {
                log.debug(
                  `Stat failed for player file ${entry.name}: ${e.message}`,
                );
              }
            }
          }
        } catch (e) {
          log.debug(`Player file scan failed: ${e.message}`);
        }
        preview.players = { files: playerFiles, size: playerSize };
        totalFiles += playerFiles;
        totalSize += playerSize;
      }

      if (targets.includes("world")) {
        let worldFiles = 0;
        let worldSize = 0;
        // Count world directories
        for (const dirName of WORLD_DIRS) {
          const dir = path.join(saveDir, dirName);
          if (await fileAccess.exists(dir)) {
            const sub = await countDir(dir);
            worldFiles += sub.files;
            worldSize += sub.size;
          }
        }
        // Count world root files
        try {
          const rootEntries = await fileAccess.readdir(saveDir, { withFileTypes: true });
          for (const entry of rootEntries) {
            if (!entry.isDirectory && WORLD_ROOT_FILES.test(entry.name)) {
              worldFiles++;
              try {
                const stat = await fileAccess.stat(path.join(saveDir, entry.name));
                if (stat) worldSize += stat.size;
              } catch (e) {
                log.debug(
                  `Stat failed for world file ${entry.name}: ${e.message}`,
                );
              }
            }
          }
        } catch (e) {
          log.debug(`World file scan failed: ${e.message}`);
        }
        preview.world = { files: worldFiles, size: worldSize };
        totalFiles += worldFiles;
        totalSize += worldSize;
      }

      // Selecting every target means a total wipe, so account for anything the
      // per-target lists don't recognise (mod files, stale backups, new formats).
      if (SAVE_TARGETS.every((t) => targets.includes(t))) {
        const claimed = new Set([...MAP_DIRS, ...WORLD_DIRS]);
        let extraFiles = 0;
        let extraSize = 0;
        try {
          for (const entry of await fileAccess.readdir(saveDir, { withFileTypes: true })) {
            if (claimed.has(entry.name)) continue;
            if (
              !entry.isDirectory &&
              (PLAYER_ROOT_FILES.test(entry.name) ||
                WORLD_ROOT_FILES.test(entry.name))
            ) {
              continue;
            }
            const fullPath = path.join(saveDir, entry.name);
            if (entry.isDirectory) {
              const sub = await countDir(fullPath);
              extraFiles += sub.files;
              extraSize += sub.size;
            } else {
              extraFiles++;
              try {
                const stat = await fileAccess.stat(fullPath);
                if (stat) extraSize += stat.size;
              } catch (e) {
                log.debug(`Stat failed for ${entry.name}: ${e.message}`);
              }
            }
          }
        } catch (e) {
          log.debug(`Leftover scan failed: ${e.message}`);
        }
        preview.leftovers = { files: extraFiles, size: extraSize };
        totalFiles += extraFiles;
        totalSize += extraSize;
      }

      if (targets.includes("accounts")) {
        let accountFiles = 0;
        let accountSize = 0;
        for (const suffix of ["", "-journal", "-wal", "-shm"]) {
          const dbFile = path.join(savePath, "db", `${serverName}.db${suffix}`);
          if (await fileAccess.exists(dbFile)) {
            accountFiles++;
            try {
              const stat = await fileAccess.stat(dbFile);
              if (stat) accountSize += stat.size;
            } catch (e) {
              log.debug(`Stat failed for ${dbFile}: ${e.message}`);
            }
          }
        }
        preview.accounts = { files: accountFiles, size: accountSize };
        totalFiles += accountFiles;
        totalSize += accountSize;
      }

      res.json({
        success: true,
        serverName,
        saveDir,
        targets,
        preview,
        totalFiles,
        totalSize,
      });
    } catch (error) {
      log.error(`Wipe preview failed: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}
