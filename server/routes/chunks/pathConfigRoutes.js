import express from "express";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Chunks");
import { getActiveServer, updateServer, setSetting } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import {
  getCandidateZomboidPaths,
  invalidateCandidatePathsCache,
} from "../../utils/zomboidPaths.js";
import { resolveCustomOrDefaultDataPath } from "./savePaths.js";

const router = express.Router();

// List common Zomboid path candidates so the UI can present clickable
// suggestions when the panel can't find a data folder on its own.
router.get("/suggested-paths", async (req, res) => {
  try {
    // Allow the UI to bust the 30s cache after the user creates/moves a
    // folder (?refresh=1) so suggestions update without a panel restart.
    if (req?.query?.refresh) invalidateCandidatePathsCache();
    res.json({
      candidates: getCandidateZomboidPaths(),
      platform: process.platform,
    });
  } catch (error) {
    log.error(`Failed to enumerate suggested paths: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Persist a custom path as the panel's configured Zomboid data folder.
// Writes to the active server's `zomboidDataPath` when one exists, otherwise
// to the legacy flat setting. The path is validated with the same rules as
// the /saves customPath query parameter so users can't smuggle in arbitrary
// directories via this endpoint.
router.post("/save-path", async (req, res) => {
  try {
    const { path: rawPath } = req.body || {};
    if (!rawPath || typeof rawPath !== "string") {
      return res.status(400).json({ error: "Missing path." });
    }
    let validated;
    try {
      validated = await resolveCustomOrDefaultDataPath(rawPath);
    } catch (e) {
      // Surface validation details so the UI can render the same empty-state
      // remediation it gets from /saves.
      const payload = { error: sanitizeError(e.message) };
      if (e.details) payload.rejection = e.details;
      return res.status(e.statusCode || 400).json(payload);
    }
    if (!validated) {
      return res
        .status(400)
        .json({ error: "Path is empty after normalization." });
    }

    const activeServer = await getActiveServer();
    if (activeServer?.id) {
      await updateServer(activeServer.id, { zomboidDataPath: validated });
      log.info(
        `[ChunkCleaner] Saved zomboidDataPath to active server "${activeServer.name}": ${validated}`,
      );
      return res.json({
        ok: true,
        target: "server",
        serverId: activeServer.id,
        path: validated,
      });
    }
    await setSetting("zomboidDataPath", validated);
    log.info(
      `[ChunkCleaner] Saved zomboidDataPath to legacy settings: ${validated}`,
    );
    res.json({ ok: true, target: "setting", path: validated });
  } catch (error) {
    log.error(`Failed to save zomboid data path: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
