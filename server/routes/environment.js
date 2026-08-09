// GET /api/system/environment — one-shot composed snapshot the first-run
// onboarding wizard uses to auto-detect platform, Docker, and any PZ server
// already present, instead of asking the user to type paths blind.
//
// No auth required: authService.middleware() already lets every /api/
// route through unauthenticated while needsSetup() is true (no admin
// account yet), which is exactly when the wizard calls this. After setup it
// falls back to normal auth like every other route.
import express from "express";
import { createLogger } from "../utils/logger.js";
const log = createLogger("API:Environment");
import { isContainerized, getContainerInfo } from "../utils/dockerDetect.js";
import { discoverMounts } from "../services/mountDiscovery.js";
import { getServers } from "../database/init.js";
import { sanitizeError } from "../utils/sanitize.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const servers = await getServers();
    res.json({
      platform: process.platform,
      containerized: isContainerized(),
      hasDockerSocket: getContainerInfo().hasDockerSocket,
      envPaths: {
        PZ_SERVER_PATH: process.env.PZ_SERVER_PATH || null,
        PZ_SAVE_PATH: process.env.PZ_SAVE_PATH || null,
      },
      discoveredMounts: discoverMounts(),
      serverCount: servers.length,
    });
  } catch (error) {
    log.error(`Failed to build environment snapshot: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
