import express from "express";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { isValidOptionName, isValidOptionValue } from "./validators.js";

const log = createLogger("API:Config");
const router = express.Router();

// Reload server options via RCON
router.post("/reload", async (req, res) => {
  try {
    const rconService = req.app.get("rconService");
    const result = await rconService.reloadOptions();
    res.json(result);
  } catch (error) {
    log.error(`Failed to reload options: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Get server options via RCON
router.get("/options", async (req, res) => {
  try {
    const rconService = req.app.get("rconService");
    const result = await rconService.showOptions();
    res.json(result);
  } catch (error) {
    log.error(`Failed to get options: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Change a specific option via RCON
router.post("/option", async (req, res) => {
  try {
    const rconService = req.app.get("rconService");
    const { name, value } = req.body;
    log.info(`POST /option: ${name}=${value}`);

    if (!name || value === undefined) {
      return res
        .status(400)
        .json({ error: "Option name and value are required" });
    }

    // Validate option name and value to prevent command injection
    if (!isValidOptionName(name)) {
      return res.status(400).json({ error: "Invalid option name format" });
    }

    if (!isValidOptionValue(value)) {
      return res.status(400).json({ error: "Invalid option value format" });
    }

    const result = await rconService.changeOption(name, value);
    res.json(result);
  } catch (error) {
    log.error(`Failed to change option: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
