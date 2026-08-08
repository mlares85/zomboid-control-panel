import { escapeLuaString } from "./luaEscape.js";
import { modifySandboxValue } from "./sandboxParse.js";

// Count { / } in a SandboxVars.lua content string. A healthy file always has
// an equal number of each with the running depth never going negative. This
// is the cheapest possible syntax sanity check we can do without a real Lua
// parser, but it happens to catch the exact class of corruption PZ's own
// dedicated server crashes on: an orphaned/dropped block header that leaves
// a dangling closing brace (see "Exiting due to errors loading ..." crashes
// with a KahluaException "'}' expected").
export function checkSandboxBraceBalance(content) {
  let depth = 0;
  let wentNegative = false;
  for (const ch of content) {
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0) wentNegative = true;
    }
  }
  return { balanced: depth === 0 && !wentNegative, depth };
}

// Attempt to auto-repair the most common SandboxVars.lua corruption pattern:
// a nested block's "<Name> = {" header line (and the trailing comma on the
// first entry) got dropped somewhere upstream (mod schema migration, manual
// editing, etc.), leaving an orphaned scalar entry at a shallower indent
// than its former siblings — with the original closing "}" still present
// further down. That desyncs the whole file's brace count and makes PZ's
// Lua loader refuse to parse the file at all.
//
// Repair strategy: whenever a scalar "key = value" line (no trailing comma)
// is immediately followed by a more-deeply-indented entry line, treat it as
// an orphaned block opener. Add the missing comma and synthesize a wrapper
// table around it so the existing (now-dangling) closing brace has
// something to match again. This is deliberately conservative — it never
// deletes or reinterprets existing content, only restores brace balance —
// and every attempt is re-validated for balance before anything is written.
export function repairSandboxSyntax(content) {
  const before = checkSandboxBraceBalance(content);
  if (before.balanced) {
    return { content, fixed: false, changes: [] };
  }

  const lines = content.split(/\r?\n/);
  const changes = [];
  const scalarLine =
    /^(\s*)(\w+)\s*=\s*("(?:[^"\\]|\\.)*"|true|false|-?\d+(?:\.\d+)?)\s*(--.*)?$/;
  const entryLine = /^(\s*)(\w+)\s*=\s*/;
  let syntheticCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(scalarLine);
    if (!m) continue;
    const indent = m[1];

    // Find the next non-blank, non-comment line.
    let j = i + 1;
    while (
      j < lines.length &&
      (lines[j].trim() === "" || /^\s*--/.test(lines[j]))
    ) {
      j++;
    }
    if (j >= lines.length) continue;

    const nextEntry = lines[j].match(entryLine);
    if (!nextEntry) continue;
    if (nextEntry[1].length <= indent.length) continue; // normal sibling/closing — not orphaned

    syntheticCounter += 1;
    changes.push(
      `Line ${i + 1}: '${m[2]} = ${m[3]}' looked like an orphaned block entry (missing block header and comma) — wrapped it in a synthetic '_RepairedBlock${syntheticCounter}' table so the file parses again.`,
    );
    lines[i] =
      `${indent}_RepairedBlock${syntheticCounter} = {\n${indent}    ${m[2]} = ${m[3]},`;
  }

  const repaired = lines.join("\n");
  const after = checkSandboxBraceBalance(repaired);
  return {
    content: repaired,
    fixed: after.balanced && changes.length > 0,
    changes,
  };
}

// Apply multiple sandbox changes to file content in-place
export function applySandboxChanges(originalContent, changes) {
  let content = originalContent;

  // Apply settings changes
  if (changes.settings) {
    for (const [key, value] of Object.entries(changes.settings)) {
      content = modifySandboxValue(content, key, value, null);
    }
  }

  // Apply ZombieLore changes
  if (changes.ZombieLore) {
    for (const [key, value] of Object.entries(changes.ZombieLore)) {
      content = modifySandboxValue(content, key, value, "ZombieLore");
    }
  }

  // Apply ZombieConfig changes
  if (changes.ZombieConfig) {
    for (const [key, value] of Object.entries(changes.ZombieConfig)) {
      content = modifySandboxValue(content, key, value, "ZombieConfig");
    }
  }

  // Apply MultiplierConfig changes
  if (changes.MultiplierConfig) {
    for (const [key, value] of Object.entries(changes.MultiplierConfig)) {
      content = modifySandboxValue(content, key, value, "MultiplierConfig");
    }
  }

  // Apply Map changes
  if (changes.Map) {
    for (const [key, value] of Object.entries(changes.Map)) {
      content = modifySandboxValue(content, key, value, "Map");
    }
  }

  // Apply Basement changes
  if (changes.Basement) {
    for (const [key, value] of Object.entries(changes.Basement)) {
      content = modifySandboxValue(content, key, value, "Basement");
    }
  }

  return content;
}

function createSandboxVarsFormatValue(value) {
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `"${escapeLuaString(String(value))}"`;
}

export function createSandboxVars(sandbox) {
  const sections = [
    "settings",
    "ZombieLore",
    "ZombieConfig",
    "MultiplierConfig",
    "Map",
    "Basement",
  ];
  const lines = ["SandboxVars = {"];
  const version = Number.isInteger(sandbox.VERSION) ? sandbox.VERSION : 4;
  lines.push(`    VERSION = ${version},`);

  for (const sectionName of sections) {
    const values = sandbox[sectionName];
    if (!values || typeof values !== "object") continue;

    if (sectionName === "settings") {
      for (const [key, value] of Object.entries(values)) {
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
          lines.push(`    ${key} = ${createSandboxVarsFormatValue(value)},`);
        }
      }
      continue;
    }

    lines.push(`    ${sectionName} = {`);
    for (const [key, value] of Object.entries(values)) {
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        lines.push(`        ${key} = ${createSandboxVarsFormatValue(value)},`);
      }
    }
    lines.push("    },");
  }

  lines.push("}");
  return lines.join("\n") + "\n";
}
