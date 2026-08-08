// Shared helpers used across the servers route sub-modules.

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
