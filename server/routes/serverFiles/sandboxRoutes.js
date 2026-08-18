import express from "express";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Files");
import { sanitizeError } from "../../utils/sanitize.js";
import { withFileLock, writeFileAtomic } from "../../utils/fileWriteQueue.js";
import { getServerConfigPath, getServerName, createBackup } from "./context.js";
import { LocalFiles } from "../../services/fileAccess/index.js";
import { parseSandboxVars, modifySandboxValue } from "./sandboxParse.js";
import {
  checkSandboxBraceBalance,
  repairSandboxSyntax,
  applySandboxChanges,
  createSandboxVars,
} from "./sandboxWrite.js";

const router = express.Router();

// Get SandboxVars (parsed)
router.get("/sandbox", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const configPath = await getServerConfigPath();
    const serverName = await getServerName();
    const filePath = path.join(configPath, `${serverName}_SandboxVars.lua`);

    if (!(await fileAccess.exists(filePath))) {
      return res.status(404).json({ error: "SandboxVars file not found" });
    }

    const { success, data: content, error } = await fileAccess.readFile(filePath);
    if (!success) {
      return res.status(500).json({ error: sanitizeError(error) });
    }
    const parsed = parseSandboxVars(content);

    res.json({ sandbox: parsed });
  } catch (error) {
    log.error("Failed to read SandboxVars:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Save SandboxVars
router.put("/sandbox", async (req, res) => {
  try {
    log.info("PUT /sandbox");
    const fileAccess = new LocalFiles();
    const configPath = await getServerConfigPath();
    const serverName = await getServerName();
    const filePath = path.join(configPath, `${serverName}_SandboxVars.lua`);
    const { sandbox } = req.body;

    if (!sandbox || typeof sandbox !== "object") {
      return res.status(400).json({ error: "Sandbox object required" });
    }

    // Guard against prototype pollution
    if (
      Object.prototype.hasOwnProperty.call(sandbox, "__proto__") ||
      Object.prototype.hasOwnProperty.call(sandbox, "constructor") ||
      Object.prototype.hasOwnProperty.call(sandbox, "prototype")
    ) {
      return res.status(400).json({ error: "Invalid sandbox data" });
    }

    // Guard nested sections against prototype pollution
    for (const section of Object.values(sandbox)) {
      if (section && typeof section === "object") {
        if (
          Object.prototype.hasOwnProperty.call(section, "__proto__") ||
          Object.prototype.hasOwnProperty.call(section, "constructor") ||
          Object.prototype.hasOwnProperty.call(section, "prototype")
        ) {
          return res.status(400).json({ error: "Invalid sandbox data" });
        }
      }
    }

    // Size limit: reject payloads > 1MB
    const payloadSize = JSON.stringify(sandbox).length;
    if (payloadSize > 1024 * 1024) {
      return res
        .status(400)
        .json({ error: "Sandbox data too large (max 1MB)" });
    }

    // Modify an existing file in-place to preserve comments and structure.
    // On a fresh server, create a valid sandbox file from the submitted schema
    // values so the editor works before the game's first boot.
    let fileExists;
    await withFileLock(filePath, async () => {
      fileExists = await fileAccess.exists(filePath);
      let newContent;
      if (fileExists) {
        const readResult = await fileAccess.readFile(filePath);
        if (!readResult.success) {
          throw new Error(readResult.error);
        }
        newContent = applySandboxChanges(readResult.data, sandbox);
      } else {
        newContent = createSandboxVars(sandbox);
      }
      if (fileExists) {
        await createBackup(`${serverName}_SandboxVars.lua`);
      }
      writeFileAtomic(filePath, newContent, "utf-8");
    });

    log.info(`${fileExists ? "Saved" : "Created"} SandboxVars file`);
    res.json({
      success: true,
      created: !fileExists,
      message: fileExists ? "Sandbox settings saved" : "SandboxVars file created",
    });
  } catch (error) {
    log.error("Failed to save SandboxVars:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Write one option into SandboxVars.lua. Mod options live in blocks the
// sandbox schema knows nothing about, so they are addressed as "Block.Key" and
// rewritten in place; a key that is not already in the file is left alone,
// since PZ regenerates those from the mod's own defaults.
router.put("/sandbox-option", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const { name, value } = req.body || {};

    if (typeof name !== "string" || !name) {
      return res.status(400).json({ error: "Option name required" });
    }
    if (!["string", "number", "boolean"].includes(typeof value)) {
      return res.status(400).json({ error: "Option value must be a primitive" });
    }

    const parts = name.split(".");
    const isIdentifier = (p) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p);
    if (parts.length > 2 || !parts.every(isIdentifier)) {
      return res.status(400).json({ error: "Invalid option name" });
    }
    const block = parts.length === 2 ? parts[0] : null;
    const key = parts.length === 2 ? parts[1] : parts[0];

    const configPath = await getServerConfigPath();
    const serverName = await getServerName();
    const filePath = path.join(configPath, `${serverName}_SandboxVars.lua`);

    if (!(await fileAccess.exists(filePath))) {
      return res.status(404).json({
        error:
          "SandboxVars file not found. Start the server once to generate it.",
      });
    }

    let persisted = false;
    await withFileLock(filePath, async () => {
      const readResult = await fileAccess.readFile(filePath);
      if (!readResult.success) {
        throw new Error(readResult.error);
      }
      const originalContent = readResult.data;
      const newContent = modifySandboxValue(originalContent, key, value, block);
      if (newContent === originalContent) return;
      await createBackup(`${serverName}_SandboxVars.lua`);
      writeFileAtomic(filePath, newContent, "utf-8");
      persisted = true;
    });

    log.info(`Sandbox option ${name} persisted: ${persisted}`);
    res.json({ success: true, persisted });
  } catch (error) {
    log.error("Failed to save sandbox option:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Check whether SandboxVars.lua is syntactically well-formed (brace balance
// only — we don't have a real Lua parser). A corrupt file here is a classic
// cause of "server won't boot, no obvious reason" reports.
router.get("/sandbox/validate", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const configPath = await getServerConfigPath();
    const serverName = await getServerName();
    const filePath = path.join(configPath, `${serverName}_SandboxVars.lua`);

    if (!(await fileAccess.exists(filePath))) {
      return res.status(404).json({ error: "SandboxVars file not found" });
    }

    const { success, data: content, error } = await fileAccess.readFile(filePath);
    if (!success) {
      return res.status(500).json({ error: sanitizeError(error) });
    }
    const { balanced, depth } = checkSandboxBraceBalance(content);
    res.json({ valid: balanced, braceDepth: depth });
  } catch (error) {
    log.error("Failed to validate SandboxVars:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Attempt to auto-repair SandboxVars.lua. Always backs up the existing file
// first, and refuses to write anything unless the repaired content is
// verified brace-balanced — if the corruption doesn't match a known
// pattern, nothing is written and the caller is told to fix it manually.
router.post("/sandbox/repair", async (req, res) => {
  try {
    log.info("POST /sandbox/repair");
    const fileAccess = new LocalFiles();
    const configPath = await getServerConfigPath();
    const serverName = await getServerName();
    const filePath = path.join(configPath, `${serverName}_SandboxVars.lua`);

    if (!(await fileAccess.exists(filePath))) {
      return res.status(404).json({ error: "SandboxVars file not found" });
    }

    const result = await withFileLock(filePath, async () => {
      const readResult = await fileAccess.readFile(filePath);
      if (!readResult.success) {
        throw new Error(readResult.error);
      }
      const originalContent = readResult.data;
      const before = checkSandboxBraceBalance(originalContent);
      if (before.balanced) {
        return { alreadyValid: true };
      }

      const {
        content: repaired,
        fixed,
        changes,
      } = repairSandboxSyntax(originalContent);
      if (!fixed) {
        return {
          alreadyValid: false,
          repaired: false,
          error:
            "Could not automatically repair this file — the corruption doesn't match a known pattern. Restore from a backup or fix it manually.",
        };
      }

      await createBackup(`${serverName}_SandboxVars.lua`);
      writeFileAtomic(filePath, repaired, "utf-8");
      return { alreadyValid: false, repaired: true, changes };
    });

    if (result.alreadyValid) {
      return res.json({
        success: true,
        alreadyValid: true,
        message: "SandboxVars.lua is already valid — no repair needed.",
      });
    }
    if (!result.repaired) {
      return res.status(422).json({ success: false, error: result.error });
    }

    log.info(
      `Repaired SandboxVars.lua: ${result.changes.length} fix(es) applied`,
    );
    res.json({
      success: true,
      repaired: true,
      changes: result.changes,
      message: `Repaired ${result.changes.length} issue${result.changes.length === 1 ? "" : "s"} in SandboxVars.lua. A backup of the broken file was saved first.`,
    });
  } catch (error) {
    log.error("Failed to repair SandboxVars:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
