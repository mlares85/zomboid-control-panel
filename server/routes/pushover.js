import express from "express";
import { createLogger } from "../utils/logger.js";
import { sanitizeError, isMaskedSecret, maskSecretValue } from "../utils/sanitize.js";
import { requireRole } from "../services/auth.js";
import { getSetting, setSetting } from "../database/init.js";
import { PushoverService } from "../services/pushoverService.js";
import { DEFAULT_CONDITIONS } from "../services/alertConditions.js";

const log = createLogger("API:Pushover");
const router = express.Router();

/** Read the currently stored alert conditions, falling back to the defaults. */
export async function getStoredConditions() {
  const stored = await getSetting("pushoverConditions");
  return Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_CONDITIONS;
}

/** Build a PushoverService from currently stored credentials, or null if unconfigured. */
async function loadPushoverService() {
  const userKey = await getSetting("pushoverUserKey");
  const apiToken = await getSetting("pushoverApiToken");
  if (!userKey || !apiToken) return null;
  return new PushoverService({ userKey, apiToken });
}

router.get("/settings", requireRole("admin"), async (req, res) => {
  try {
    const userKey = await getSetting("pushoverUserKey");
    const apiToken = await getSetting("pushoverApiToken");
    const enabled = await getSetting("pushoverEnabled");
    res.json({
      userKey: userKey || "",
      apiToken: apiToken ? maskSecretValue(apiToken) : "",
      hasApiToken: !!apiToken,
      enabled: enabled !== false,
    });
  } catch (error) {
    log.error(`Failed to get Pushover settings: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Resolve the apiToken to persist: the client's echoed masked placeholder
// means "keep what's already stored", so swap it back for the real value.
async function resolveApiToken(apiToken) {
  if (!isMaskedSecret(apiToken)) return apiToken;
  return getSetting("pushoverApiToken");
}

router.put("/settings", requireRole("admin"), async (req, res) => {
  try {
    const { userKey, enabled } = req.body || {};
    const apiToken = await resolveApiToken(req.body?.apiToken);
    if (!userKey || typeof userKey !== "string" || !apiToken || typeof apiToken !== "string") {
      return res.status(400).json({ error: "userKey and apiToken are required" });
    }

    const service = new PushoverService({ userKey, apiToken });
    const validation = await service.validateConfig();
    if (!validation.success) {
      return res.status(400).json({ error: `Pushover validation failed: ${validation.error}` });
    }

    await setSetting("pushoverUserKey", userKey);
    await setSetting("pushoverApiToken", apiToken);
    if (typeof enabled === "boolean") await setSetting("pushoverEnabled", enabled);

    res.json({ success: true, message: "Pushover settings saved" });
  } catch (error) {
    log.error(`Failed to update Pushover settings: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/test", requireRole("admin"), async (req, res) => {
  try {
    const service = await loadPushoverService();
    if (!service) {
      return res.status(400).json({ error: "Pushover is not configured" });
    }
    const result = await service.sendNotification({
      title: "Zomboid Control Panel",
      message: "This is a test notification from the Zomboid Control Panel.",
      priority: 0,
    });
    if (!result.success) {
      return res.status(502).json({ error: result.error });
    }
    res.json({ success: true, message: "Test notification sent" });
  } catch (error) {
    log.error(`Failed to send Pushover test notification: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.get("/conditions", requireRole("admin"), async (req, res) => {
  try {
    res.json({ conditions: await getStoredConditions() });
  } catch (error) {
    log.error(`Failed to get alert conditions: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

const VALID_OPERATORS = new Set([">", ">=", "<", "<=", "==", "!="]);

/** Structural validation only — this is a boundary, not full business logic. */
function isValidCondition(condition) {
  return (
    condition &&
    typeof condition.id === "string" &&
    typeof condition.metric === "string" &&
    VALID_OPERATORS.has(condition.operator) &&
    condition.threshold !== undefined &&
    typeof condition.enabled === "boolean"
  );
}

router.put("/conditions", requireRole("admin"), async (req, res) => {
  try {
    const { conditions } = req.body || {};
    if (!Array.isArray(conditions)) {
      return res.status(400).json({ error: "conditions must be an array" });
    }
    const invalid = conditions.find((condition) => !isValidCondition(condition));
    if (invalid) {
      return res.status(400).json({ error: `Invalid condition: ${JSON.stringify(invalid)}` });
    }
    await setSetting("pushoverConditions", conditions);
    res.json({ success: true, conditions });
  } catch (error) {
    log.error(`Failed to update alert conditions: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/conditions/reset", requireRole("admin"), async (req, res) => {
  try {
    await setSetting("pushoverConditions", DEFAULT_CONDITIONS);
    res.json({ success: true, conditions: DEFAULT_CONDITIONS });
  } catch (error) {
    log.error(`Failed to reset alert conditions: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
