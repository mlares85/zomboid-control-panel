/**
 * Remote (SFTP-mirrored) PanelBridge transport: test/configure the SFTP
 * connection, tail remote logs, and preview the remote config directory.
 */

import express from "express";
import bridge from "../../services/panelBridge.js";
import { getAllSettings, setSetting } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { requireRole } from "../../services/auth.js";
import {
  getSftpCachePath,
  testSftpBridge,
  validateSftpBridgeConfig,
  listSftpLogs,
  readSftpLogTail,
} from "../../services/panelBridgeSftp.js";
import {
  SFTP_CONFIG_PATH_KEY,
  listRemoteConfigFiles,
  resetRemoteConfigSession,
  validateRemoteConfigTransport,
} from "../../services/remoteConfigFiles.js";

const router = express.Router();

const SFTP_SETTING_KEYS = {
  enabled: "panelBridgeSftpEnabled",
  host: "panelBridgeSftpHost",
  port: "panelBridgeSftpPort",
  username: "panelBridgeSftpUsername",
  password: "panelBridgeSftpPassword",
  bridgePath: "panelBridgeSftpBridgePath",
  pollIntervalSeconds: "panelBridgeSftpPollIntervalSeconds",
};

const SFTP_LOG_PATH_KEY = "panelBridgeSftpLogPath";

function isMaskedSecret(value) {
  return typeof value === "string" && value.startsWith("••••••••");
}

async function resolveSftpConfig(input = {}) {
  const settings = await getAllSettings();
  const password = input.password && !isMaskedSecret(input.password)
    ? input.password
    : settings[SFTP_SETTING_KEYS.password] || "";
  return validateSftpBridgeConfig({
    host: input.host ?? settings[SFTP_SETTING_KEYS.host],
    port: input.port ?? settings[SFTP_SETTING_KEYS.port],
    username: input.username ?? settings[SFTP_SETTING_KEYS.username],
    password,
    bridgePath: input.bridgePath ?? settings[SFTP_SETTING_KEYS.bridgePath],
    pollIntervalSeconds: input.pollIntervalSeconds ?? settings[SFTP_SETTING_KEYS.pollIntervalSeconds],
  });
}

// The log transport reuses the bridge credentials but has its own remote path
// and does not require a configured bridgePath.
async function resolveSftpLogConfig(input = {}) {
  const settings = await getAllSettings();
  const password = input.password && !isMaskedSecret(input.password)
    ? input.password
    : settings[SFTP_SETTING_KEYS.password] || "";
  return {
    host: input.host ?? settings[SFTP_SETTING_KEYS.host],
    port: input.port ?? settings[SFTP_SETTING_KEYS.port],
    username: input.username ?? settings[SFTP_SETTING_KEYS.username],
    password,
    logPath: input.logPath ?? settings[SFTP_LOG_PATH_KEY],
  };
}

router.post("/sftp/test", requireRole("admin"), async (req, res) => {
  try {
    const config = await resolveSftpConfig(req.body);
    const result = await testSftpBridge(config);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: sanitizeError(error.message) });
  }
});

router.post("/sftp/configure", requireRole("admin"), async (req, res) => {
  try {
    const config = await resolveSftpConfig(req.body);
    for (const [field, key] of Object.entries(SFTP_SETTING_KEYS)) {
      const value = field === "enabled" ? true : config[field];
      if (value !== undefined) await setSetting(key, value);
    }
    const cachePath = getSftpCachePath(config);
    await bridge.configureSftp(config, cachePath);
    res.json({ success: true, bridgePath: cachePath, transport: bridge.getStatus().transport });
  } catch (error) {
    res.status(400).json({ error: sanitizeError(error.message) });
  }
});

router.post("/sftp/logs/list", requireRole("admin"), async (req, res) => {
  try {
    const config = await resolveSftpLogConfig(req.body);
    const result = await listSftpLogs(config);
    if (req.body?.logPath) await setSetting(SFTP_LOG_PATH_KEY, config.logPath);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ error: sanitizeError(error.message) });
  }
});

router.post("/sftp/logs/tail", requireRole("admin"), async (req, res) => {
  try {
    const config = await resolveSftpLogConfig(req.body);
    const result = await readSftpLogTail(config, req.body?.name, req.body?.maxBytes);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ error: sanitizeError(error.message) });
  }
});

// Verify the remote Server/ folder the config editor mirrors for a remote server.
router.post("/sftp/config/list", requireRole("admin"), async (req, res) => {
  try {
    const settings = await getAllSettings();
    const password =
      req.body?.password && !isMaskedSecret(req.body.password)
        ? req.body.password
        : settings[SFTP_SETTING_KEYS.password] || "";
    const config = validateRemoteConfigTransport({
      host: req.body?.host ?? settings[SFTP_SETTING_KEYS.host],
      port: req.body?.port ?? settings[SFTP_SETTING_KEYS.port],
      username: req.body?.username ?? settings[SFTP_SETTING_KEYS.username],
      password,
      configPath: req.body?.configPath ?? settings[SFTP_CONFIG_PATH_KEY],
    });
    const result = await listRemoteConfigFiles(config);
    if (req.body?.configPath) {
      await setSetting(SFTP_CONFIG_PATH_KEY, config.configPath);
      resetRemoteConfigSession();
    }
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ error: sanitizeError(error.message) });
  }
});

export default router;
