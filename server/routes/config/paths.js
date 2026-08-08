import express from "express";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";

const log = createLogger("API:Config");
const router = express.Router();

// Get paths configuration
router.get("/paths", async (req, res) => {
  try {
    res.json({
      serverPath: process.env.PZ_SERVER_PATH || "",
      savePath: process.env.PZ_SAVE_PATH || "",
      serverBat:
        process.env.PZ_SERVER_BAT ||
        (process.platform === "win32"
          ? "StartServer64.bat"
          : "start-server.sh"),
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Update paths (runtime only - doesn't persist to .env)
router.put("/paths", async (req, res) => {
  try {
    const serverManager = req.app.get("serverManager");
    const { serverPath, savePath } = req.body;

    // Validate paths
    if (serverPath !== undefined) {
      if (
        typeof serverPath !== "string" ||
        serverPath.length > 500 ||
        serverPath.includes("..")
      ) {
        return res.status(400).json({ error: "Invalid server path" });
      }
    }
    if (savePath !== undefined) {
      if (
        typeof savePath !== "string" ||
        savePath.length > 500 ||
        savePath.includes("..")
      ) {
        return res.status(400).json({ error: "Invalid save path" });
      }
    }

    serverManager.updatePaths(serverPath, savePath);

    res.json({ success: true, message: "Paths updated" });
  } catch (error) {
    log.error(`Failed to update paths: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
