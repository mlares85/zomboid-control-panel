const SECRET_FIELD_RE =
  /(password|secret|token|apikey|api_key|jwt|sessionid|loginsecure|cookie|webhook)/i;
const ENV_VALUE_ALLOWLIST = [
  "NODE_ENV",
  "PORT",
  "LOG_LEVEL",
  "HTTPS",
  "FORCE_HSTS",
  "CORS_ORIGINS",
  "CORS_ALLOW_PRIVATE_NETWORKS",
  "CORS_ALLOW_ALL",
  "TZ",
  "LANG",
  "LC_ALL",
  "PUID",
  "PGID",
  "NODE_VERSION",
  "PATH_PREFIX",
  "TRUST_PROXY",
  "PWD",
];
const ENV_PRESENCE_ONLY = [
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "JWT_SECRET",
  "RCON_PASSWORD",
  "DISCORD_TOKEN",
  "STEAM_API_KEY",
  "PANEL_PASSWORD",
  "ADMIN_PASSWORD",
];

function maskValue(v) {
  return v == null ? v : "••••";
}

/** Deep-clone with any field whose key looks secret-like masked. */
export function sanitizeForBundle(value, depth = 0) {
  if (value == null || depth > 8) return value;
  if (Array.isArray(value))
    return value.map((v) => sanitizeForBundle(v, depth + 1));
  if (typeof value !== "object") return value;

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_FIELD_RE.test(k) && typeof v === "string" && v.length > 0) {
      out[k] = maskValue(v);
    } else if (
      k === "discordWebhookUrl" &&
      typeof v === "string" &&
      v.includes("/webhooks/")
    ) {
      out[k] = v.replace(/\/webhooks\/(\d+)\/[^/?#]+/i, "/webhooks/$1/••••");
    } else {
      out[k] = sanitizeForBundle(v, depth + 1);
    }
  }
  return out;
}

export async function buildEnvironmentReport() {
  const lines = [
    "# Environment variables (allow-listed)",
    "# Only values for explicitly safe vars are shown.",
    "# Other entries report PRESENCE ONLY (no value).",
    "",
  ];
  for (const key of ENV_VALUE_ALLOWLIST) {
    if (process.env[key] !== undefined) {
      lines.push(`${key}=${process.env[key]}`);
    }
  }
  lines.push("");
  lines.push("# Presence-only (value redacted)");
  for (const key of ENV_PRESENCE_ONLY) {
    lines.push(
      `${key}=${process.env[key] !== undefined ? "<set>" : "<unset>"}`,
    );
  }
  lines.push("");
  lines.push("# All other env var NAMES present (no values)");
  const known = new Set([...ENV_VALUE_ALLOWLIST, ...ENV_PRESENCE_ONLY]);
  const others = Object.keys(process.env)
    .filter((k) => !known.has(k))
    .sort();
  for (const k of others) {
    lines.push(`${k}=<redacted>`);
  }
  return lines.join("\n") + "\n";
}
