/**
 * Docker-managed bridge installation: installs PanelBridge.lua into the
 * managed container via putArchive and configures the exec-based sync
 * transport so the bridge can communicate with the mod.
 */

import express from "express";
import path from "path";
import bridge from "../../services/panelBridge.js";
import { installBridgeToContainer } from "../../services/dockerBridgeInstaller.js";
import { getActiveServer, getServer } from "../../database/init.js";
import { isDockerManaged } from "../../utils/serverProvider.js";
import { requireRole } from "../../services/auth.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { getDataPaths } from "../../utils/paths.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("API:PanelBridge:Docker");
const router = express.Router();

router.post("/install-docker", requireRole("admin"), async (req, res) => {
  try {
    const serverId = req.body?.serverId;
    const server = serverId ? await getServer(serverId) : await getActiveServer();
    if (!server) {
      return res.status(400).json({ error: "No server found." });
    }
    if (!isDockerManaged(server)) {
      return res.status(400).json({ error: "This endpoint is for docker-managed servers only." });
    }

    const dockerClient = req.app.get("dockerClient");
    if (!dockerClient?.available) {
      return res.status(400).json({ error: "Docker socket is not available." });
    }

    const containerId = server.dockerContainerId;
    if (!containerId) {
      return res.status(400).json({ error: "No container ID found for this server." });
    }

    // Step 1: Install the mod into the container
    const installResult = await installBridgeToContainer(dockerClient, containerId, "/opt/pz-server");
    if (!installResult.success) {
      return res.status(500).json({ error: `Mod install failed: ${installResult.error}` });
    }

    // Step 2: Configure the exec-based bridge transport
    const cachePath = path.join(getDataPaths().dataDir, "bridge-cache", server.serverName);
    await bridge.configureDocker(dockerClient, containerId, server.serverName, cachePath);

    log.info(`Docker bridge configured for ${server.serverName} (container ${containerId})`);
    res.json({
      success: true,
      message: `PanelBridge installed and bridge configured for ${server.serverName}`,
      bridgePath: bridge.bridgePath,
    });
  } catch (error) {
    log.error(`Docker bridge install failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
