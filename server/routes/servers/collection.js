import express from "express";
import { createLogger } from "../../utils/logger.js";
import {
  sanitizeError,
  sanitizeServerResponse,
  sanitizeServerResponseList,
} from "../../utils/sanitize.js";
import { normalizeRconHost } from "../../services/rcon.js";
import { getServers, createServer } from "../../database/init.js";
import { normalizeMemoryGb } from "./shared.js";

const log = createLogger("API:Servers");
const router = express.Router();

// Get all servers
router.get("/", async (req, res) => {
  try {
    const servers = await getServers();
    res.json({ servers: sanitizeServerResponseList(servers) });
  } catch (error) {
    log.error(`Failed to get servers: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Create a new server
router.post("/", async (req, res) => {
  try {
    const config = req.body;
    log.info(
      `POST / — creating server: name=${config?.name}, remote=${!!config?.isRemote}`,
    );

    // Validate required fields - installPath not required for remote servers
    // or when PZ_SERVER_PATH env var is set (Docker/compose topologies).
    const isRemote = !!config.isRemote;
    const hasInstallPath = config.installPath || process.env.PZ_SERVER_PATH;
    const requiredFields = isRemote
      ? ["name", "rconHost", "rconPort", "rconPassword"]
      : ["name", "rconHost", "rconPort", "rconPassword"];
    if (!isRemote && !hasInstallPath) requiredFields.push("installPath");
    for (const field of requiredFields) {
      if (!config[field]) {
        return res
          .status(400)
          .json({ error: `Missing required field: ${field}` });
      }
    }

    // Validate display name length
    if (typeof config.name !== "string" || config.name.length > 100) {
      return res
        .status(400)
        .json({ error: "Server name must be under 100 characters" });
    }

    // Validate RCON port
    const rconPort = parseInt(config.rconPort, 10);
    if (isNaN(rconPort) || rconPort < 1 || rconPort > 65535) {
      return res.status(400).json({ error: "Invalid RCON port" });
    }

    // Validate serverName against path traversal
    const serverName = (config.serverName || "servertest").trim();
    if (
      !/^[a-zA-Z0-9_-][a-zA-Z0-9_\- ]*[a-zA-Z0-9_-]$|^[a-zA-Z0-9_-]$/.test(
        serverName,
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            "Invalid server name: only letters, numbers, underscores, hyphens and spaces allowed",
        });
    }

    // Validate server port if provided
    if (config.serverPort) {
      const serverPort = parseInt(config.serverPort, 10);
      if (isNaN(serverPort) || serverPort < 1 || serverPort > 65535) {
        return res.status(400).json({ error: "Invalid server port" });
      }
    }

    // Seed empty paths from env vars so Docker/compose setups work without
    // the user manually typing the container-internal mount path.
    const installPath = config.installPath || process.env.PZ_SERVER_PATH || "";
    const zomboidDataPath = config.zomboidDataPath || process.env.PZ_SAVE_PATH || null;

    const server = await createServer({
      name: config.name,
      serverName: config.serverName || "servertest",
      installPath,
      zomboidDataPath,
      serverConfigPath: config.serverConfigPath || null,
      branch: config.branch || "stable",
      rconHost: normalizeRconHost(config.rconHost),
      rconPort: rconPort,
      rconPassword: config.rconPassword,
      adminPassword: config.adminPassword || "",
      serverPort: parseInt(config.serverPort, 10) || 16261,
      minMemory: normalizeMemoryGb(config.minMemory, 4),
      maxMemory: normalizeMemoryGb(config.maxMemory, 8),
      useNoSteam: !!config.useNoSteam,
      useDebug: !!config.useDebug,
      isRemote: isRemote,
    });

    log.info(`Created new server: ${server.name} (ID: ${server.id})`);
    res
      .status(201)
      .json({
        server: sanitizeServerResponse(server),
        message: "Server created successfully",
      });
  } catch (error) {
    log.error(`Failed to create server: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
