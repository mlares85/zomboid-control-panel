// Validation helpers for app-settings and RCON option writes.
import fs from "fs";

export const VALID_SETTINGS_KEYS = [
  "rconHost",
  "rconPort",
  "rconPassword",
  "serverPath",
  "serverConfigPath",
  "zomboidDataPath",
  "steamcmdPath",
  "steamUpdateAccount",
  "steamApiKey",
  "serverName",
  "minMemory",
  "maxMemory",
  "serverPort",
  "modCheckInterval",
  "modAutoRestart",
  "modRestartDelay",
  "serverAutoUpdate",
  "serverAutoUpdateWarningMinutes",
  "darkMode",
  "autoReconnect",
  "reconnectInterval",
  // Discord config is owned by /api/discord (discordBotToken,
  // discordAdminRoleId, ...). The old discordEnabled/discordToken/
  // discordAdminRole keys are deliberately NOT listed: nothing reads them, so
  // allowing them here would accept a write that silently never takes effect.
  "discordGuildId",
  "autoStartServer",
  "panelPort",
  "httpsEnabled",
  "httpsPort",
  "httpsKeyPath",
  "httpsCertPath",
  "corsAllowedOrigins",
  "corsAllowAll",
  "corsAllowPrivateNetworks",
  "corsDebug",
  "panelBridgeAutoUpdate",
  "autoExportOnLogin",
  "autoExportMaxPerPlayer",
  // Opt-in external public-IP lookup (api.ipify.org) shown on the dashboard/
  // panel-info — off by default (see serverManager.fetchPublicIp).
  "enablePublicIpLookup",
  // Workshop collection sync — mirrors tracked mods into a Steam collection.
  // steamSessionId / steamLoginSecure are cookie pairs; treated as secrets.
  "workshopCollectionId",
  "workshopCollectionAutoSync",
  "steamSessionId",
  "steamLoginSecure",
  // Chat page Quick Messages presets — array of strings.
  "chatPresets",
  // Dashboard LAN IP override — pick which detected interface to display
  // when the host has more than one (multiple VPN meshes, etc). Empty
  // string clears it back to auto-detect.
  "lanIpAddress",
  "panelBridgeSftpEnabled",
  "panelBridgeSftpHost",
  "panelBridgeSftpPort",
  "panelBridgeSftpUsername",
  "panelBridgeSftpPassword",
  "panelBridgeSftpBridgePath",
  "panelBridgeSftpPollIntervalSeconds",
  "panelBridgeSftpLogPath",
  "panelBridgeSftpConfigPath",
];

const OPTION_NAME_REGEX = /^[a-zA-Z0-9_]{1,64}$/;
const OPTION_VALUE_REGEX = /^[a-zA-Z0-9_.,:;\/ -]{0,256}$/;
const ORIGIN_DELIMITER_REGEX = /[\n,;]+/;
const MAX_CORS_ALLOWED_ORIGINS_LENGTH = 5000;
const MAX_CORS_ALLOWED_ORIGINS = 100;
const MAX_CORS_ORIGIN_LENGTH = 256;

export function isValidOptionName(name) {
  return typeof name === "string" && OPTION_NAME_REGEX.test(name);
}

export function isValidOptionValue(value) {
  const strVal = String(value);
  return OPTION_VALUE_REGEX.test(strVal);
}

// httpsCertPath/httpsKeyPath used to be accepted as any string and only
// ever checked at panel BOOT (utils/certs.js), where a bad value (directory
// instead of a file, unreadable) crashed the whole process. Rejecting a bad
// value here, at save time, is what actually prevents an operator from
// saving one in the first place — a value that goes bad AFTER being saved
// (moved/deleted/permissions changed later) is a separate case handled by
// certs.js's own defensive fallback at boot.
export function validateHttpsFilePath(key, value) {
  if (value === "") return null; // empty clears the custom cert
  if (typeof value !== "string") return `${key} must be a string`;

  let stat;
  try {
    stat = fs.statSync(value);
  } catch {
    return `${key} does not point to a file that exists: ${value}`;
  }
  if (!stat.isFile()) {
    return `${key} must be a file, not a directory: ${value}`;
  }
  try {
    fs.accessSync(value, fs.constants.R_OK);
  } catch {
    return `${key} exists but is not readable by the panel: ${value}`;
  }
  return null;
}

// A bad httpsPort (out of range, or colliding with the panel's own HTTP
// port) is the other half of the same lockout: HTTPS setup at boot has no
// way to recover from either without filesystem access to edit db.json.
export function validateHttpsPort(value, panelPort) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return "httpsPort must be a whole number from 1 to 65535";
  }
  if (panelPort && port === Number(panelPort)) {
    return `httpsPort cannot be the same as the panel's HTTP port (${panelPort})`;
  }
  return null;
}

// Same missing-range-check shape as httpsPort, but the worst case if it
// slips through is a too-fast/too-slow reconnect timer, not a lockout —
// worth closing anyway since it's one check alongside the others.
export function validateReconnectInterval(value) {
  const interval = Number(value);
  if (!Number.isInteger(interval) || interval < 1 || interval > 60) {
    return "reconnectInterval must be a whole number from 1 to 60";
  }
  return null;
}

export function validateCorsAllowedOrigins(value) {
  if (typeof value !== "string") {
    return "CORS allowed origins must be a string list";
  }

  if (value.length > MAX_CORS_ALLOWED_ORIGINS_LENGTH) {
    return `CORS allowed origins list is too long (max ${MAX_CORS_ALLOWED_ORIGINS_LENGTH} characters)`;
  }

  const rawOrigins = value
    .split(ORIGIN_DELIMITER_REGEX)
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (rawOrigins.length > MAX_CORS_ALLOWED_ORIGINS) {
    return `Too many CORS origins (max ${MAX_CORS_ALLOWED_ORIGINS})`;
  }

  for (const origin of rawOrigins) {
    if (origin.length > MAX_CORS_ORIGIN_LENGTH) {
      return `Origin is too long (max ${MAX_CORS_ORIGIN_LENGTH} chars): ${origin.slice(0, 40)}...`;
    }
    try {
      const url = new URL(origin);
      if (!["http:", "https:"].includes(url.protocol)) {
        return `Only http/https origins are allowed: ${origin}`;
      }
    } catch {
      return `Invalid origin format: ${origin}`;
    }
  }

  return null;
}
