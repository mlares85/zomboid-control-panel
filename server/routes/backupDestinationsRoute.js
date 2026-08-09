import express from "express";
import { createLogger } from "../utils/logger.js";
import { sanitizeError } from "../utils/sanitize.js";
import { requireRole } from "../services/auth.js";
import {
  listDestinations,
  addDestinationRecord,
  updateDestinationRecord,
  deleteDestinationRecord,
  testDestinationById,
  redactDestination,
  isDestinationTypeKnown,
  getDestinationRecord,
} from "../services/backupDestinations/index.js";
import { buildAuthUrl, exchangeCodeForTokens } from "../services/backupDestinations/googleDriveOAuth.js";

const log = createLogger("API:Backup:Destinations");
const router = express.Router();

async function defaultLocalPath(req) {
  const backupService = req.app.get("backupService");
  return backupService.getBackupsPath();
}

router.get("/destinations", async (req, res) => {
  try {
    const destinations = await listDestinations({ defaultLocalPath: await defaultLocalPath(req) });
    res.json({ destinations });
  } catch (error) {
    log.error(`Failed to list destinations: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/destinations", requireRole("admin"), async (req, res) => {
  try {
    const { type, name, path: destPath, config } = req.body || {};
    if (!isDestinationTypeKnown(type)) {
      return res.status(400).json({ error: `Unknown destination type: ${type}` });
    }
    const record = await addDestinationRecord({ type, name, path: destPath, config });
    res.json({ success: true, destination: redactDestination(record) });
  } catch (error) {
    log.error(`Failed to add destination: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/destinations/:id", requireRole("admin"), async (req, res) => {
  try {
    const record = await updateDestinationRecord(req.params.id, req.body || {});
    res.json({ success: true, destination: redactDestination(record) });
  } catch (error) {
    log.error(`Failed to update destination: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete("/destinations/:id", requireRole("admin"), async (req, res) => {
  try {
    await deleteDestinationRecord(req.params.id);
    res.json({ success: true });
  } catch (error) {
    log.error(`Failed to delete destination: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/destinations/:id/test", requireRole("admin"), async (req, res) => {
  const result = await testDestinationById(req.params.id, {
    defaultLocalPath: await defaultLocalPath(req),
  });
  res.json(result);
});

// ── Google Drive OAuth2 (manual code-paste flow, see googleDriveOAuth.js) ──
router.post("/gdrive/auth-url", requireRole("admin"), (req, res) => {
  try {
    const { clientId, redirectUri } = req.body || {};
    res.json({ url: buildAuthUrl({ clientId, redirectUri }) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/gdrive/callback", requireRole("admin"), async (req, res) => {
  try {
    const { destinationId, code, redirectUri, clientId, clientSecret } = req.body || {};
    const record = await getDestinationRecord(destinationId);
    if (!record || record.type !== "google-drive") {
      return res.status(404).json({ success: false, message: "Google Drive destination not found" });
    }
    const tokens = await exchangeCodeForTokens({ clientId, clientSecret, code, redirectUri });
    // clientId/clientSecret are stored alongside the refresh token because
    // GoogleDriveDestination needs them again for every future silent
    // token refresh (Google refresh tokens aren't self-describing).
    await updateDestinationRecord(destinationId, {
      config: { clientId, clientSecret, refreshToken: tokens.refreshToken, connected: true },
    });
    res.json({ success: true, message: "Google Drive connected" });
  } catch (error) {
    log.error(`Google Drive callback failed: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
