import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Files");
import { escapeRegExp } from "../../utils/regex.js";
import { escapeLuaString, unescapeLuaString } from "./luaEscape.js";

// Parse SandboxVars.lua
export function parseSandboxVars(content) {
  const result = {
    VERSION: 4,
    settings: {},
    ZombieLore: {},
    ZombieConfig: {},
    MultiplierConfig: {},
    Map: {},
    Basement: {},
  };

  // Known nested blocks to skip when parsing top-level settings
  const nestedBlocks = [
    "ZombieLore",
    "ZombieConfig",
    "MultiplierConfig",
    "Map",
    "Basement",
  ];

  try {
    // Extract VERSION
    const versionMatch = content.match(/VERSION\s*=\s*(\d+)/);
    if (versionMatch) {
      result.VERSION = parseInt(versionMatch[1], 10);
    }

    // Strip nested block regions from content so the top-level regex
    // doesn't accidentally capture keys that belong inside ZombieLore,
    // ZombieConfig, MultiplierConfig, Map, or Basement.
    let topLevelContent = content;
    for (const blockName of nestedBlocks) {
      const blockPattern = new RegExp(
        escapeRegExp(blockName) + "\\s*=\\s*\\{[\\s\\S]*?\\n\\s*\\}",
        "m",
      );
      topLevelContent = topLevelContent.replace(blockPattern, "");
    }

    // Parse simple key=value pairs (top-level settings only).
    // The value alternation tries a quoted string first so values like
    // WorldItemRemovalList = "Base.Hat,Base.Glasses,..." aren't truncated
    // at the first comma *inside* the quotes.
    const simplePattern =
      /^\s*(\w+)\s*=\s*("(?:[^"\\]|\\.)*"|[^,{}\n]+),?\s*(?:--.*)?$/gm;
    let match;
    while ((match = simplePattern.exec(topLevelContent)) !== null) {
      const key = match[1];
      let value = match[2].trim();

      // Skip nested objects and VERSION
      if (nestedBlocks.includes(key) || key === "VERSION") continue;

      // Parse value type
      if (value === "true") value = true;
      else if (value === "false") value = false;
      else if (!isNaN(parseFloat(value))) value = parseFloat(value);
      else value = unescapeLuaString(value);

      result.settings[key] = value;
    }

    // Helper function to parse a nested block
    function parseNestedBlock(blockName) {
      // Match nested blocks - handle both simple and complex nested structures
      const blockPattern = new RegExp(
        `${blockName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\s*\\}`,
        "m",
      );
      const blockMatch = content.match(blockPattern);

      if (blockMatch) {
        const blockContent = blockMatch[1];
        // Strip Lua comment lines to avoid parsing comment text as keys
        // (e.g. "-- 1 = Sprinters" or "-- Default = Random")
        const strippedContent = blockContent.replace(/^\s*--.*$/gm, "");
        const valuePattern = /(\w+)\s*=\s*("(?:[^"\\]|\\.)*"|[^,\n]+)/g;
        let valueMatch;
        while ((valueMatch = valuePattern.exec(strippedContent)) !== null) {
          let value = valueMatch[2].trim();
          // Remove trailing comma if present
          value = value.replace(/,\s*$/, "");

          if (value === "true") value = true;
          else if (value === "false") value = false;
          else if (!isNaN(parseFloat(value))) value = parseFloat(value);
          else value = unescapeLuaString(value);

          result[blockName][valueMatch[1]] = value;
        }
      }
    }

    // Parse all nested blocks
    nestedBlocks.forEach(parseNestedBlock);
  } catch (error) {
    log.error("Failed to parse SandboxVars:", error);
  }

  return result;
}

// Format a number for Lua, preserving the original file's decimal format
export function formatLuaNumber(newValue, originalValueStr) {
  const trimmed = originalValueStr
    ? originalValueStr.trim().replace(/,\s*$/, "")
    : "";
  // If the original value had a decimal point and the new value is a whole number, add .0
  if (Number.isInteger(newValue) && trimmed.includes(".")) {
    return newValue.toFixed(1);
  }
  return newValue.toString();
}

// Modify a single value in the SandboxVars file content in-place
// Preserves all comments and file structure
export function modifySandboxValue(
  originalContent,
  key,
  newValue,
  nestedBlock = null,
) {
  let content = originalContent;

  // Validate key is a valid identifier (alphanumeric and underscore only)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
    log.warn(`Invalid sandbox key skipped: ${key}`);
    return content;
  }

  // Format the value for Lua (base format, may be refined by context)
  function formatValue(originalValueStr) {
    if (typeof newValue === "boolean") {
      return newValue.toString();
    } else if (typeof newValue === "number") {
      return formatLuaNumber(newValue, originalValueStr);
    } else {
      return `"${escapeLuaString(String(newValue))}"`;
    }
  }

  // Escape key for use in regex (even though we validate, this is defense in depth)
  const escapedKey = escapeRegExp(key);

  if (nestedBlock) {
    // For nested blocks (ZombieLore, ZombieConfig, etc.)
    // Only match actual assignment lines (not comment lines starting with --)
    const escapedBlock = escapeRegExp(nestedBlock);
    const blockStartPattern = new RegExp(`${escapedBlock}\\s*=\\s*\\{`);
    const blockStartMatch = content.match(blockStartPattern);
    if (blockStartMatch) {
      const blockStart = blockStartMatch.index;
      const blockEnd = content.indexOf(
        "}",
        blockStart + blockStartMatch[0].length,
      );
      if (blockEnd !== -1) {
        const before = content.substring(0, blockStart);
        const blockSection = content.substring(blockStart, blockEnd + 1);
        const after = content.substring(blockEnd + 1);
        // Replace only on non-comment lines within the block.
        // The value alternation matches a full quoted string first so
        // values containing commas (e.g. comma-separated lists) aren't
        // truncated mid-string, which would corrupt the Lua syntax.
        const updatedBlock = blockSection.replace(
          new RegExp(
            `(^(?!\\s*--)[^\\n]*?)(${escapedKey})(\\s*=\\s*)("(?:[^"\\\\]|\\\\.)*"|[^,\\n}]+)(,?)`,
            "m",
          ),
          (_, prefix, k, eq, oldVal, comma) =>
            `${prefix}${k}${eq}${formatValue(oldVal)}${comma}`,
        );
        content = before + updatedBlock + after;
      }
    }
  } else {
    // For top-level settings, only replace occurrences OUTSIDE nested blocks
    // to avoid accidentally modifying keys that share a name with a nested key.
    const knownBlocks = [
      "ZombieLore",
      "ZombieConfig",
      "MultiplierConfig",
      "Map",
      "Basement",
    ];
    const blockRanges = [];
    for (const bn of knownBlocks) {
      const bp = new RegExp(escapeRegExp(bn) + "\\s*=\\s*\\{");
      const bm = content.match(bp);
      if (bm) {
        const start = bm.index;
        const end = content.indexOf("}", start + bm[0].length);
        if (end !== -1) blockRanges.push({ start, end: end + 1 });
      }
    }

    // The value alternation matches a full quoted string first so values
    // containing commas (e.g. comma-separated lists like
    // WorldItemRemovalList) aren't truncated mid-string, which would
    // corrupt the Lua syntax.
    const pattern = new RegExp(
      `(^\\s*)(${escapedKey})(\\s*=\\s*)("(?:[^"\\\\]|\\\\.)*"|[^,\\n}]+)(,?)(\\s*(?:--.*)?$)`,
      "gm",
    );
    content = content.replace(
      pattern,
      (fullMatch, indent, k, eq, oldVal, comma, comment, offset) => {
        // Skip matches inside nested blocks
        for (const range of blockRanges) {
          if (offset >= range.start && offset < range.end) return fullMatch;
        }
        return `${indent}${k}${eq}${formatValue(oldVal)}${comma}${comment}`;
      },
    );
  }

  return content;
}
