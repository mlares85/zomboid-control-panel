import express from "express";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";

const log = createLogger("API:Config");
const router = express.Router();

// Get server configuration
router.get("/", async (req, res) => {
  try {
    const serverManager = req.app.get("serverManager");
    const config = await serverManager.getServerConfig();
    res.json({ config });
  } catch (error) {
    log.error(`Failed to get config: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Update server configuration
router.put("/", async (req, res) => {
  try {
    log.info("PUT /config — saving server config");
    const serverManager = req.app.get("serverManager");
    const { config } = req.body;

    if (!config) {
      return res.status(400).json({ error: "Config is required" });
    }

    const saved = await serverManager.saveServerConfig(config);
    if (!saved?.success) {
      return res.status(500).json({
        error: sanitizeError(saved?.error || "Configuration could not be written"),
      });
    }
    res.json({ success: true, message: "Configuration saved" });
  } catch (error) {
    log.error(`Failed to save config: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
