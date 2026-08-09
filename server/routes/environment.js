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
import {
  isContainerized,
  getContainerInfo,
  detectDockerRuntime,
} from "../utils/dockerDetect.js";
import { discoverEnvironmentMounts } from "../services/mountDiscovery.js";
import { buildPlatformGuidance } from "../services/platformGuidance.js";
import { getServers } from "../database/init.js";
import { sanitizeError } from "../utils/sanitize.js";

const router = express.Router();

// The Linux "is a Docker socket bind-mounted into this container" check
// (hasDockerSocket) doesn't apply on macOS/Windows, where the panel usually
// runs natively next to Docker Desktop/OrbStack rather than inside a
// container — so guidance falls back to shelling out for those platforms.
function resolveDockerRuntime(hasDockerSocket) {
  if (hasDockerSocket) return "native";
  return detectDockerRuntime();
}

router.get("/", async (req, res) => {
  try {
    const servers = await getServers();
    const containerInfo = getContainerInfo();
    const dockerRuntime = resolveDockerRuntime(containerInfo.hasDockerSocket);
    res.json({
      platform: process.platform,
      containerized: isContainerized(),
      hasDockerSocket: containerInfo.hasDockerSocket,
      envPaths: {
        PZ_SERVER_PATH: process.env.PZ_SERVER_PATH || null,
        PZ_SAVE_PATH: process.env.PZ_SAVE_PATH || null,
      },
      discoveredMounts: discoverEnvironmentMounts(),
      serverCount: servers.length,
      platformGuidance: buildPlatformGuidance({
        platform: process.platform,
        dockerRuntime,
      }),
    });
  } catch (error) {
    log.error(`Failed to build environment snapshot: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
