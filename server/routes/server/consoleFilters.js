// Noise/error/important-line classification for server-console.txt.

// Filter patterns for console log - patterns to exclude (noise)
const CONSOLE_LOG_EXCLUDE_PATTERNS = [
  // Duplicate sprites/textures (very spammy)
  /IsoSpriteManager\.AddSprite > duplicate texture/,
  // PlayerHitZombie packet spam (not consistent packets)
  /The packet PlayerHitZombie is not consistent/,
  // Missing icons for build items (cosmetic only)
  /XuiSkin\$EntityUiStyle\.Load > Could not find icon:/,
  /XuiSkin\$EntityUiStyle\.LoadComponentInfo> Could not find icon:/,
  // Recursive require warnings (usually harmless)
  /LuaManager\.RunLua > recursive require\(\)/,
  // AnimalPacket/AnimalEventPacket class warnings (known issue)
  /The AnimalPacket class doesn't have PacketSetting attributes/,
  /The AnimalEventPacket class doesn't have PacketSetting attributes/,
];

// Patterns for errors (always show these)
export const CONSOLE_LOG_ERROR_PATTERNS = [
  /^ERROR\[/,
  /Exception thrown/,
  /Stack trace:/,
  /java\.lang\.\w+Exception/,
  /KahluaThread\.flushErrorMessage/,
];

// Patterns for important info (always show these)
const CONSOLE_LOG_IMPORTANT_PATTERNS = [
  /^\[PanelBridge\]/,
  /SERVER STARTED/,
  /fully-connected/,
  /player-connect/,
  /connection-lost/,
  /disconnect/,
  /Steam client .* is initiating/,
  /RCON:/,
  /Recipe AutoLearned/,
  /Reduce Head Condition/,
  /ISBuildIsoEntity/,
];

/**
 * Filter console log lines based on filter level
 * @param {string[]} lines - Array of log lines
 * @param {string} filterLevel - 'all' | 'filtered' | 'important' | 'errors'
 * @returns {string[]} Filtered lines
 */
export function filterConsoleLogLines(lines, filterLevel = "filtered") {
  if (filterLevel === "all") {
    return lines;
  }

  return lines.filter((line) => {
    if (!line.trim()) return false;

    // Always include error lines
    const isError = CONSOLE_LOG_ERROR_PATTERNS.some((pattern) =>
      pattern.test(line),
    );
    if (isError) return true;

    // Always include important lines
    const isImportant = CONSOLE_LOG_IMPORTANT_PATTERNS.some((pattern) =>
      pattern.test(line),
    );
    if (isImportant) return true;

    // For 'errors' level, only show errors
    if (filterLevel === "errors") {
      return isError;
    }

    // For 'important' level, show errors + important
    if (filterLevel === "important") {
      return isError || isImportant;
    }

    // For 'filtered' level (default), exclude noise patterns
    const isNoise = CONSOLE_LOG_EXCLUDE_PATTERNS.some((pattern) =>
      pattern.test(line),
    );
    return !isNoise;
  });
}
