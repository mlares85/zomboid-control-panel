import express from "express";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";

const log = createLogger("API:Config");
const router = express.Router();

// Get RCON configuration
router.get("/rcon", async (req, res) => {
  try {
    const rconService = req.app.get("rconService");
    const config = rconService.getConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Validation for RCON config
const RCON_HOST_REGEX = /^[a-zA-Z0-9.-]{1,255}$/;
const RCON_PASSWORD_MAX_LENGTH = 256;

// Update RCON configuration
router.put("/rcon", async (req, res) => {
  try {
    const rconService = req.app.get("rconService");
    const { host, port, password } = req.body;

    // Validate host (if provided)
    if (host !== undefined) {
      if (typeof host !== "string" || !RCON_HOST_REGEX.test(host)) {
        return res.status(400).json({ error: "Invalid host format" });
      }
    }

    // Validate port (if provided)
    if (port !== undefined) {
      const portNum = parseInt(port, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        return res
          .status(400)
          .json({ error: "Invalid port number (must be 1-65535)" });
      }
    }

    // Validate password length (if provided)
    if (password !== undefined) {
      if (
        typeof password !== "string" ||
        password.length > RCON_PASSWORD_MAX_LENGTH
      ) {
        return res.status(400).json({ error: "Invalid password format" });
      }
    }

    rconService.updateConfig(host, port, password);

    res.json({ success: true, message: "RCON configuration updated" });
  } catch (error) {
    log.error(`Failed to update RCON config: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Test RCON connection
router.post("/test-rcon", async (req, res) => {
  try {
    const rconService = req.app.get("rconService");

    // Try to connect
    const connected = await rconService.connect();

    if (connected) {
      // Try a lightweight command to verify the connection is alive
      // Avoid 'help' — PZ dumps a huge response that can overflow RCON packets and hang
      try {
        // execute() reports a failed command by return value, so the catch
        // below only ever saw transport-level errors.
        const probe = await rconService.execute("players", { skipLog: true });
        if (!probe?.success) {
          res.json({
            success: true,
            message:
              "Connected but command failed: " + sanitizeError(probe?.error),
            connected: true,
            warning: true,
          });
          return;
        }
        res.json({
          success: true,
          message: "RCON connection successful",
          connected: true,
        });
      } catch (cmdError) {
        res.json({
          success: true,
          message:
            "Connected but command failed: " + sanitizeError(cmdError.message),
          connected: true,
          warning: true,
        });
      }
    } else {
      res.json({
        success: false,
        message: "Failed to connect to RCON",
        connected: false,
      });
    }
  } catch (error) {
    log.error(`RCON test failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: sanitizeError(error.message),
      connected: false,
    });
  }
});

export default router;
