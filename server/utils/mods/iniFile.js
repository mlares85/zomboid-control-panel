import fs from "fs";

// ─── INI write mutex ────────────────────────────────────────────────────────
// Serialises write operations to the same INI file so concurrent requests
// cannot interleave their writes (prevents lost-update race conditions).
const iniLocks = new Map(); // iniPath → Promise chain
export function withIniLock(iniPath, fn) {
  const prev = iniLocks.get(iniPath) || Promise.resolve();
  const next = prev.then(fn, fn); // run fn regardless of previous result
  iniLocks.set(iniPath, next);
  return next;
}

// Strip UTF-8 BOM (byte-order mark) that some text editors prepend to files.
// If present, the BOM breaks regex patterns anchored with ^ on the first line.
export function stripBom(str) {
  return str.charCodeAt(0) === 0xfeff ? str.slice(1) : str;
}

// Read a text file as UTF-8 with BOM stripping and CRLF normalisation
export function readTextFile(filePath) {
  return stripBom(fs.readFileSync(filePath, "utf-8")).replace(/\r\n/g, "\n");
}

// Parse a semicolon-delimited INI list value (Mods=, WorkshopItems=, ...),
// tolerating trailing/embedded whitespace around entries and separators
// (e.g. "mod1 ; mod2 " -> ["mod1", "mod2"]). Accepts the raw regex-match
// capture directly, including undefined when the key wasn't present.
export function parseIniList(value) {
  if (!value) return [];
  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
