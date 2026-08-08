export const MAX_CORS_ALLOWED_ORIGINS = 100;
export const MAX_CORS_ORIGIN_LENGTH = 256;

// Human-friendly age string for bridge diagnostics. Avoids showing the user
// raw seconds counts like "3344627s" which read as gibberish.
export function formatBridgeAge(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "unknown";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

export function formatTimestamp(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function normalizePort(value: string): string {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535) {
    return String(parsed);
  }
  return "3001";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

// Basic cron validation helper
export function isValidCron(cron: string): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const patterns = [
    /^(\*|\d+|\*\/\d+|\d+-\d+|\d+(,\d+)*)$/, // minute
    /^(\*|\d+|\*\/\d+|\d+-\d+|\d+(,\d+)*)$/, // hour
    /^(\*|\d+|\*\/\d+|\d+-\d+|\d+(,\d+)*)$/, // day of month
    /^(\*|\d+|\*\/\d+|\d+-\d+|\d+(,\d+)*)$/, // month
    /^(\*|\d+|\*\/\d+|\d+-\d+|\d+(,\d+)*)$/, // day of week
  ];

  return parts.every((part, i) => patterns[i].test(part));
}

export function validateCorsOriginsInput(rawInput: string): string | null {
  const origins = rawInput
    .split(/[\n,;]+/)
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length > MAX_CORS_ALLOWED_ORIGINS) {
    return `Too many origins. Maximum is ${MAX_CORS_ALLOWED_ORIGINS}.`;
  }

  for (const origin of origins) {
    if (origin.length > MAX_CORS_ORIGIN_LENGTH) {
      return `Origin too long (${origin.length} chars). Maximum is ${MAX_CORS_ORIGIN_LENGTH}.`;
    }

    try {
      const parsed = new URL(origin);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return `Only http/https origins are allowed: ${origin}`;
      }
    } catch {
      return `Invalid origin format: ${origin}`;
    }
  }

  return null;
}
