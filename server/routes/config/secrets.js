// Sensitive keys that should be masked in API responses
export const SENSITIVE_KEYS = [
  "rconPassword",
  // Retained so any value left in an existing db.json stays masked, even
  // though this key is no longer writable.
  "discordToken",
  "steamApiKey",
  "steamSessionId",
  "steamLoginSecure",
  "panelBridgeSftpPassword",
];

// Detect a value that is just the bullet-mask we send to the client.
// If the user saves Settings without re-pasting a sensitive value, the
// masked string would otherwise overwrite the real secret in the DB.
// Accepts the canonical "•••...xxxx" sentinel from maskSensitiveSettings
// as well as values that are entirely bullets / asterisks (defence in
// depth in case the mask format changes).
export function isMaskedSecret(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.startsWith("••••••••")) return true;
  if (/^[•*•●○]+$/.test(value)) return true;
  return false;
}

export function maskSensitiveSettings(settings) {
  const masked = { ...settings };
  for (const key of SENSITIVE_KEYS) {
    if (
      masked[key] &&
      typeof masked[key] === "string" &&
      masked[key].length > 0
    ) {
      masked[key] = "••••••••" + masked[key].slice(-4);
    }
  }
  return masked;
}
