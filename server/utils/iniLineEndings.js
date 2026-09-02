/**
 * Detect and preserve INI file line endings.
 *
 * Windows PZ servers produce CRLF (\r\n) INI files. Normalizing to LF for
 * manipulation is fine, but the file must be written back with the original
 * line ending or PZ may reject it on next read.
 */

/**
 * Detect whether the file content uses CRLF line endings.
 * Returns "\r\n" if CRLF is found, "\n" otherwise.
 */
export function detectLineEnding(content) {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * Normalize content to LF for safe manipulation, returning the original
 * line ending for later restoration.
 */
export function normalizeToLf(content) {
  const eol = detectLineEnding(content);
  return { normalized: content.replace(/\r\n/g, "\n"), eol };
}

/**
 * Restore the original line ending after manipulation.
 * Only converts if the original was CRLF.
 */
export function restoreLineEnding(content, eol) {
  if (eol === "\r\n") {
    // Ensure we don't double-convert: normalize to LF first, then CRLF
    return content.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  }
  return content;
}
