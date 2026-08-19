// Shared helpers used across the servers route sub-modules.

// serverName is interpolated into filesystem paths (server-files, backups,
// chunks) as `${serverName}.ini` etc. — reject anything but a plain,
// non-traversal-capable name up front instead of relying on every
// downstream path-building call site to re-validate it.
const SERVER_NAME_REGEX =
  /^[a-zA-Z0-9_-][a-zA-Z0-9_\- ]*[a-zA-Z0-9_-]$|^[a-zA-Z0-9_-]$/;

export function isValidServerName(value) {
  return typeof value === "string" && SERVER_NAME_REGEX.test(value);
}

export function normalizeMemoryGb(value, fallback) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  if (parsed > 128) {
    return Math.max(1, Math.round(parsed / 1024));
  }
  return parsed;
}

// Server IDs are either legacy numeric ids or UUIDs (contain dashes/letters).
export function parseServerId(id) {
  const isUUID = /[a-f-]/i.test(id);
  return isUUID ? id : parseInt(id, 10);
}
