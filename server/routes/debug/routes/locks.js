import express from "express";
import fs from "fs";
import path from "path";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import { getActiveServer } from "../../../database/init.js";

const log = createLogger("API:Debug");
const router = express.Router();

// Remove stale *.lock files from the active save folder. Refuses to run
// while the server is still alive so we don't yank a lock the JVM still
// holds open. Only deletes files older than 1 hour (matches the
// diagnostics threshold in scanSaveStats).
router.post("/clear-stale-locks", async (req, res) => {
  try {
    log.info("POST /clear-stale-locks");
    const serverManager = req.app.get("serverManager");
    let running = false;
    try {
      if (typeof serverManager?.checkServerRunning === "function") {
        running = await serverManager.checkServerRunning();
      } else {
        running = !!serverManager?.isRunning;
      }
    } catch {
      running = !!serverManager?.isRunning;
    }
    if (running) {
      return res.status(409).json({
        success: false,
        error:
          "Stop the server before clearing lock files. PZ holds these open while running.",
      });
    }

    const activeServer = await getActiveServer().catch(() => null);
    if (!activeServer) {
      return res
        .status(400)
        .json({ success: false, error: "No active server is configured." });
    }
    const zPath = activeServer.zomboidDataPath || null;
    if (!zPath || !activeServer.serverName) {
      return res.status(400).json({
        success: false,
        error:
          "Active server has no Zomboid data path or server name configured.",
      });
    }

    const savesRoot = path.join(zPath, "Saves");
    const candidates = [
      path.join(savesRoot, "Multiplayer", activeServer.serverName),
    ];
    if (
      activeServer.savename &&
      activeServer.savename !== activeServer.serverName
    ) {
      candidates.push(
        path.join(savesRoot, "Multiplayer", activeServer.savename),
      );
    }
    let saveDir = null;
    for (const sp of candidates) {
      try {
        const st = await fs.promises.stat(sp);
        if (st.isDirectory()) {
          saveDir = sp;
          break;
        }
      } catch {
        /* not present */
      }
    }
    if (!saveDir) {
      return res
        .status(404)
        .json({ success: false, error: "Active save folder not found." });
    }

    const MAX_FILES = 50000;
    const staleAfterMs = 60 * 60 * 1000;
    const now = Date.now();
    const deleted = [];
    const failed = [];
    let visited = 0;
    let truncated = false;

    const walk = async (dir) => {
      if (visited >= MAX_FILES) {
        truncated = true;
        return;
      }
      let names;
      try {
        names = await fs.promises.readdir(dir);
      } catch {
        return;
      }
      for (const name of names) {
        if (++visited > MAX_FILES) {
          truncated = true;
          return;
        }
        const full = path.join(dir, name);
        let st;
        try {
          st = await fs.promises.stat(full);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          await walk(full);
        } else if (
          st.isFile() &&
          (name.endsWith(".lock") || name === ".lock")
        ) {
          if (now - st.mtimeMs > staleAfterMs) {
            try {
              await fs.promises.unlink(full);
              deleted.push(full);
            } catch (err) {
              failed.push({ path: full, error: err.message });
            }
          }
        }
      }
    };
    await walk(saveDir);

    log.info(
      `Cleared ${deleted.length} stale lock file(s) from ${saveDir} (${failed.length} failed)`,
    );
    res.json({
      success: true,
      deleted: deleted.length,
      failed: failed.length,
      truncated,
      saveDir,
      message:
        `Removed ${deleted.length} stale lock file${deleted.length === 1 ? "" : "s"}` +
        (failed.length > 0 ? ` (${failed.length} could not be deleted)` : "") +
        ".",
    });
  } catch (error) {
    log.error(`Failed to clear stale locks: ${error.message}`);
    res
      .status(500)
      .json({ success: false, error: sanitizeError(error.message) });
  }
});

export default router;
