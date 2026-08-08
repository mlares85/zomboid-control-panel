// Validation helpers to prevent RCON command injection
// Allow normal in-game names (spaces/symbols) but block control chars and quote/backslash.
export const USERNAME_REGEX = /^[^\x00-\x1F\x7F"\\]{1,64}$/;
export const SAFE_TEXT_REGEX = /^[a-zA-Z0-9\s.,!?'":;()@#&+=%_\-\u00C0-\u024F]{0,256}$/;
export const ITEM_REGEX = /^[A-Za-z0-9_]+\.[A-Za-z0-9_&#+.\-]+$/;

export function isValidUsername(username) {
  if (typeof username !== 'string') return false;
  const trimmed = username.trim();
  return trimmed.length > 0 && USERNAME_REGEX.test(trimmed);
}

export function isValidText(text) {
  return typeof text === 'string' && SAFE_TEXT_REGEX.test(text);
}

export function isValidItem(item) {
  return typeof item === 'string' && ITEM_REGEX.test(item);
}

export function isValidNumber(num, min = -Infinity, max = Infinity) {
  if (num === null || num === undefined || num === '') return false;
  const n = Number(num);
  return Number.isFinite(n) && n >= min && n <= max;
}
