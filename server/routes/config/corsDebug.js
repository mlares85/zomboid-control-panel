import express from "express";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";

const log = createLogger("API:Config");
const router = express.Router();

// CORS diagnostics for remote access troubleshooting
router.get("/cors-debug", async (req, res) => {
  try {
    const getCorsDebugSnapshot = req.app.get("getCorsDebugSnapshot");
    if (typeof getCorsDebugSnapshot !== "function") {
      return res
        .status(500)
        .json({ error: "CORS diagnostics are not available" });
    }
    res.json({ diagnostics: getCorsDebugSnapshot() });
  } catch (error) {
    log.error(`Failed to get CORS diagnostics: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/cors-debug/reload", async (req, res) => {
  try {
    const refreshCorsConfig = req.app.get("refreshCorsConfig");
    if (typeof refreshCorsConfig !== "function") {
      return res
        .status(500)
        .json({ error: "CORS config reload is not available" });
    }
    const diagnostics = await refreshCorsConfig();
    res.json({ success: true, diagnostics });
  } catch (error) {
    log.error(`Failed to reload CORS config: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.delete("/cors-debug/blocked", async (req, res) => {
  try {
    const clearCorsBlockedOrigins = req.app.get("clearCorsBlockedOrigins");
    const getCorsDebugSnapshot = req.app.get("getCorsDebugSnapshot");
    if (
      typeof clearCorsBlockedOrigins !== "function" ||
      typeof getCorsDebugSnapshot !== "function"
    ) {
      return res
        .status(500)
        .json({ error: "CORS diagnostics are not available" });
    }

    clearCorsBlockedOrigins();
    res.json({ success: true, diagnostics: getCorsDebugSnapshot() });
  } catch (error) {
    log.error(`Failed to clear blocked CORS origins: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
