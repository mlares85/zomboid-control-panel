import express from "express";
import net from "net";
import { createLogger } from "../../utils/logger.js";
import { getAllSettings, getSetting, setSetting } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import {
  MOD_CHECK_INTERVAL_MINUTES_MAX,
  MOD_CHECK_INTERVAL_MINUTES_MIN,
  minutesToCheckIntervalMs,
} from "../../services/modChecker.js";
import {
  VALID_SETTINGS_KEYS,
  validateCorsAllowedOrigins,
  validateHttpsFilePath,
  validateHttpsPort,
  validateReconnectInterval,
} from "./validators.js";
import { SENSITIVE_FIELD_RE, isMaskedSecret, maskSensitiveSettings } from "./secrets.js";
import { requireRole } from "../../services/auth.js";

const log = createLogger("API:Config");
const router = express.Router();

// Get application settings
router.get("/app-settings", async (req, res) => {
  try {
    const settings = await getAllSettings();
    res.json({ settings: maskSensitiveSettings(settings) });
  } catch (error) {
    log.error(`Failed to get app settings: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Validate a single [key, value] entry against its field-specific rules.
// Returns an error message string, or null if valid. Async because the
// httpsPort collision check needs to read the panel's own HTTP port.
async function validateSettingEntry(key, value) {
  if (key === "corsAllowedOrigins") {
    return validateCorsAllowedOrigins(value);
  }
  if (key === "modCheckInterval" && minutesToCheckIntervalMs(value) === null) {
    return `modCheckInterval must be a whole number of minutes from ${MOD_CHECK_INTERVAL_MINUTES_MIN} to ${MOD_CHECK_INTERVAL_MINUTES_MAX}`;
  }
  if (key === "lanIpAddress" && value !== "" && net.isIP(value) !== 4) {
    return "lanIpAddress must be an IPv4 address or empty";
  }
  if (key === "httpsCertPath" || key === "httpsKeyPath") {
    return validateHttpsFilePath(key, value);
  }
  if (key === "httpsPort") {
    return validateHttpsPort(value, await getSetting("panelPort"));
  }
  if (key === "reconnectInterval") {
    return validateReconnectInterval(value);
  }
  const booleanKeys = [
    "corsAllowAll",
    "corsAllowPrivateNetworks",
    "corsDebug",
    "panelBridgeAutoUpdate",
    "autoExportOnLogin",
    "enablePublicIpLookup",
  ];
  if (booleanKeys.includes(key) && typeof value !== "boolean") {
    return `${key} must be true or false`;
  }
  if (key === "chatPresets") {
    return validateChatPresets(value);
  }
  return null;
}

// Array of short strings, max 50 entries, each <=500 chars.
function validateChatPresets(value) {
  if (!Array.isArray(value)) return "chatPresets must be an array";
  if (value.length > 50) return "chatPresets supports up to 50 entries";
  if (!value.every((v) => typeof v === "string" && v.length <= 500)) {
    return "chatPresets entries must be strings up to 500 characters";
  }
  return null;
}

// Apply the mod-checker-related side effects for settings that changed.
async function applyModCheckerSettings(filtered, req) {
  const modChecker = req.app.get("modChecker");

  const modCheckIntervalEntry = filtered.find(([key]) => key === "modCheckInterval");
  if (modCheckIntervalEntry) {
    const [, minutes] = modCheckIntervalEntry;
    if (modChecker?.setCheckIntervalMinutes) {
      await modChecker.setCheckIntervalMinutes(minutes);
    } else {
      await setSetting("modCheckInterval", Number(minutes));
    }
  }

  const autoRestartEntry = filtered.find(([key]) => key === "modAutoRestart");
  if (autoRestartEntry && modChecker?.setUpdateCallback) {
    const [, enabled] = autoRestartEntry;
    await modChecker.setUpdateCallback(
      enabled ? async (updatedMods) => modChecker.handleModUpdate(updatedMods) : null,
    );
  }

  const restartDelayEntry = filtered.find(([key]) => key === "modRestartDelay");
  if (restartDelayEntry && modChecker?.setRestartOptions) {
    const [, warningMinutes] = restartDelayEntry;
    await modChecker.setRestartOptions({ warningMinutes });
  }
}

// Reload serverManager/rconService/CORS after a settings save, collecting
// any non-fatal reload failures as warnings to surface to the client.
async function reloadServicesAfterSave(req) {
  const serverManager = req.app.get("serverManager");
  const rconService = req.app.get("rconService");
  const refreshCorsConfig = req.app.get("refreshCorsConfig");
  const reloadWarnings = [];

  if (serverManager?.reloadConfig) {
    try {
      await serverManager.reloadConfig();
    } catch (reloadErr) {
      log.warn(`serverManager reload failed after settings save: ${reloadErr.message}`);
      reloadWarnings.push("Server manager failed to reload — restart may be required");
    }
  }
  if (rconService?.loadConfig) {
    try {
      rconService.configLoaded = false;
      await rconService.loadConfig();
    } catch (reloadErr) {
      log.warn(`rconService reload failed after settings save: ${reloadErr.message}`);
      reloadWarnings.push("RCON service failed to reload — reconnect may be required");
    }
  }
  if (typeof refreshCorsConfig === "function") {
    try {
      await refreshCorsConfig();
    } catch (reloadErr) {
      log.warn(`CORS config reload failed after settings save: ${reloadErr.message}`);
      reloadWarnings.push("CORS settings could not be reloaded — panel restart may be required");
    }
  }
  return reloadWarnings;
}

// Update application settings. Admin-gated: this endpoint can flip
// corsAllowAll (disables CORS origin checking panel-wide) and other
// security-relevant settings, so any authenticated-but-unprivileged
// account must not be able to write it.
router.put("/app-settings", requireRole("admin"), async (req, res) => {
  try {
    const { settings } = req.body;
    log.info(
      `PUT /app-settings — updating ${settings ? Object.keys(settings).length : 0} keys: [${settings ? Object.keys(settings).join(", ") : ""}]`,
    );

    if (!settings || typeof settings !== "object") {
      return res.status(400).json({ error: "Settings are required" });
    }

    // Only allow valid setting keys to prevent prototype pollution
    const validEntries = [];
    for (const [key, value] of Object.entries(settings)) {
      if (!VALID_SETTINGS_KEYS.includes(key)) {
        log.warn(`Invalid setting key rejected: ${key}`);
        continue;
      }

      const validationError = await validateSettingEntry(key, value);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      validEntries.push([key, value]);
    }

    // Never overwrite a stored secret with the masked sentinel we send to
    // the client. Without this guard, clicking Save after a page reload
    // (where the input pre-fills with •••...) would silently corrupt
    // RCON passwords, Discord tokens, and Steam cookies. See workshop
    // collection "cookies not configured" bug for the symptom.
    const filtered = validEntries.filter(([key, value]) => {
      if (SENSITIVE_FIELD_RE.test(key) && isMaskedSecret(value)) {
        log.info(`Preserving stored value for sensitive key "${key}" (masked input ignored)`);
        return false;
      }
      return true;
    });

    for (const [key, value] of filtered) {
      if (key === "modCheckInterval") continue;
      await setSetting(key, value);
    }

    await applyModCheckerSettings(filtered, req);
    const reloadWarnings = await reloadServicesAfterSave(req);

    const response = { success: true, message: "Settings saved" };
    if (reloadWarnings.length) response.warnings = reloadWarnings;
    res.json(response);
  } catch (error) {
    log.error(`Failed to save app settings: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
