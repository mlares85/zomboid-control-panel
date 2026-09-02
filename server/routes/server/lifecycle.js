// PZ server process lifecycle: start / stop / force-stop / restart.
import { createLogger } from "../../utils/logger.js";
import { logServerEvent, getActiveServer } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { ensureRconConfigured, startServerReadyPolling } from "./lifecycleHelpers.js";
import { regenerateStartupScriptsForServer } from "./startupScripts.js";

const log = createLogger("API:Server");

export function registerLifecycleRoutes(router) {
  // Start server
  router.post("/start", async (req, res) => {
    try {
      const activeServer = await getActiveServer();
      log.info(
        `POST /start (server=${activeServer?.name || "unknown"}, remote=${activeServer?.isRemote || false})`,
      );
      if (activeServer?.isRemote) {
        return res.status(400).json({
          error:
            "Cannot start a remote server. Remote servers are managed externally — use RCON to interact.",
        });
      }

      const serverManager = req.app.get("serverManager");
      const rconService = req.app.get("rconService");

      // Pre-configure RCON in the INI BEFORE starting the server process.
      // PZ reads the INI at startup, so we must write the password first.
      // On first run this also pre-creates the INI file with RCON settings.
      try {
        const rconReady = await ensureRconConfigured();
        if (rconReady) {
          log.info("RCON pre-configured in INI before server start");
        } else {
          log.warn(
            "Could not pre-configure RCON — will retry during startup polling",
          );
        }
      } catch (rconErr) {
        log.warn(`RCON pre-configuration failed: ${rconErr.message}`);
      }

      // Regenerate startup scripts so any config changes (admin password, memory, etc.) take effect
      const scriptResult = await regenerateStartupScriptsForServer(activeServer);
      if (!scriptResult.success) {
        log.warn(`Could not regenerate startup scripts: ${scriptResult.error}`);
      } else if (!scriptResult.skipped) {
        log.info("Regenerated startup scripts with current server config");
      }

      const result = await serverManager.startServer();

      // Emit status update via Socket.IO
      const io = req.app.get("io");

      // Set flag to prevent RCON reconnect attempts during startup
      // Use setServerStarting which has a 5-minute failsafe timeout
      if (rconService.setServerStarting) {
        rconService.setServerStarting(true);
      } else {
        rconService.serverStarting = true;
      }

      // Poll for server to actually be running (takes a few seconds to start),
      // then for RCON to come up. Fire-and-forget: does not block the response.
      startServerReadyPolling({
        serverManager,
        rconService,
        io,
        discordBot: req.app.get("discordBot"),
      });

      // Send immediate response
      res.json(result);
    } catch (error) {
      // "Already running" is not an error — the server is in the desired
      // state. Return success so the dashboard doesn't show error toasts
      // when it polls /start for a container that was started during creation.
      if (error.message === "Server is already running") {
        return res.json({ success: true, message: "Server is already running" });
      }
      log.error(`Failed to start server: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  // Stop server (graceful via RCON, routed through Docker for managed containers)
  router.post("/stop", async (req, res) => {
    try {
      const rconService = req.app.get("rconService");
      const serverManager = req.app.get("serverManager");
      log.info("POST /stop — graceful shutdown requested");

      // Check if RCON is connected first
      if (!rconService.connected) {
        return res.status(400).json({
          error: "RCON not connected. Cannot gracefully stop server.",
          detail:
            "Check your RCON host, port, and password in Settings > RCON, or stop the server from Docker directly.",
          fixUrl: "/settings?tab=connection",
        });
      }

      // Save first — quitting after a failed save discards everything since
      // the last one.
      const saved = await rconService.save();
      if (!saved?.success) {
        return res.status(502).json({
          error: `Save failed, so the server was left running: ${sanitizeError(saved?.error)}`,
        });
      }

      // For Docker-backed servers, stop the container instead of RCON quit.
      // RCON quit kills PID 1 inside the container, causing the restart
      // policy to revive it — the server never actually stops.
      let result;
      if (serverManager._isDockerBacked()) {
        result = await serverManager.stopServer(false);
      } else {
        result = await rconService.quit();
      }

      const io = req.app.get("io");
      if (io) io.to("server-status").emit("server:status", { running: false });

      await logServerEvent("server_stop", "Server stopped via web UI");
      req.app
        .get("discordBot")
        ?.sendEventNotification("serverStop", {})
        .catch((err) =>
          log.debug(`Discord serverStop notification failed: ${err.message}`),
        );
      res.json(result);
    } catch (error) {
      log.error(`Failed to stop server: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  // Force stop server
  router.post("/force-stop", async (req, res) => {
    try {
      log.info("POST /force-stop — force kill requested");
      const activeServer = await getActiveServer();
      if (activeServer?.isRemote) {
        return res.status(400).json({
          error:
            "Cannot force-stop a remote server. The process is not managed by this panel.",
        });
      }

      const serverManager = req.app.get("serverManager");
      const result = await serverManager.stopServer(false);

      const io = req.app.get("io");
      if (io) io.to("server-status").emit("server:status", { running: false });

      res.json(result);
    } catch (error) {
      log.error(`Failed to force stop server: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });

  // Restart server
  router.post("/restart", async (req, res) => {
    try {
      const activeServer = await getActiveServer();
      if (activeServer?.isRemote) {
        return res.status(400).json({
          error:
            "Cannot restart a remote server. The process is not managed by this panel.",
        });
      }

      const scheduler = req.app.get("scheduler");
      // Parse and clamp warningMinutes to 0-60 (matches /api/scheduler/restart-now)
      let warningMinutes = parseInt(req.body.warningMinutes, 10);
      if (isNaN(warningMinutes) || warningMinutes < 0) {
        warningMinutes = 5; // Default
      } else if (warningMinutes > 60) {
        warningMinutes = 60; // Cap at 60 minutes
      }

      // Run restart in background with specified warning time
      scheduler.performRestart(warningMinutes).catch((err) => {
        log.error(`Restart failed: ${err.message}`);
      });

      res.json({
        success: true,
        message:
          warningMinutes > 0
            ? `Restart initiated with ${warningMinutes} minute warning`
            : "Immediate restart initiated",
      });
    } catch (error) {
      log.error(`Failed to restart server: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}
