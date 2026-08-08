import express from "express";
import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Files");
import { sanitizeError } from "../../utils/sanitize.js";
import { withFileLock, writeFileAtomic } from "../../utils/fileWriteQueue.js";
import { getServerConfigPath, getServerName, createBackup } from "./context.js";

const router = express.Router();

// Parse INI file to object
export function parseIni(content) {
  const result = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      result[key] = value;
    }
  }

  return result;
}

// Convert object back to INI format
export function toIni(obj, originalContent = "") {
  // Preserve comments and order from original
  if (originalContent) {
    const lines = originalContent.split(/\r?\n/);
    const result = [];
    const written = new Set();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) {
        result.push(line);
        continue;
      }

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        if (key in obj) {
          // Strip newlines from values to prevent INI injection
          const safeValue = String(obj[key]).replace(/[\r\n]/g, "");
          result.push(`${key}=${safeValue}`);
          written.add(key);
        } else {
          result.push(line);
        }
      } else {
        result.push(line);
      }
    }

    // Add any new keys (only if they have a non-empty value)
    for (const [key, value] of Object.entries(obj)) {
      if (!written.has(key)) {
        // Skip empty values for keys that weren't in the original file
        if (value === "" || value === undefined || value === null) continue;
        // Validate key is a safe INI identifier
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
          log.warn(`Invalid INI key skipped: ${key}`);
          continue;
        }
        const safeValue = String(value).replace(/[\r\n]/g, "");
        result.push(`${key}=${safeValue}`);
      }
    }

    return result.join("\n");
  }

  // Generate from scratch
  return Object.entries(obj)
    .filter(([key]) => {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        log.warn(`Invalid INI key skipped: ${key}`);
        return false;
      }
      return true;
    })
    .map(([key, value]) => {
      const safeValue = String(value).replace(/[\r\n]/g, "");
      return `${key}=${safeValue}`;
    })
    .join("\n");
}

// Get INI file (parsed)
router.get("/ini", async (req, res) => {
  try {
    const configPath = await getServerConfigPath();
    const serverName = await getServerName();
    const filePath = path.join(configPath, `${serverName}.ini`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "INI file not found" });
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = parseIni(content);

    res.json({ settings: parsed });
  } catch (error) {
    log.error("Failed to read INI:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Save INI file
router.put("/ini", async (req, res) => {
  try {
    const configPath = await getServerConfigPath();
    const serverName = await getServerName();
    log.info(
      `PUT /ini: serverName=${serverName}, keys=${Object.keys(req.body.settings || {}).length}`,
    );
    const filePath = path.join(configPath, `${serverName}.ini`);
    const { settings } = req.body;

    if (!settings || typeof settings !== "object") {
      return res.status(400).json({ error: "Settings object required" });
    }

    // Guard against prototype pollution
    if (
      Object.prototype.hasOwnProperty.call(settings, "__proto__") ||
      Object.prototype.hasOwnProperty.call(settings, "constructor") ||
      Object.prototype.hasOwnProperty.call(settings, "prototype")
    ) {
      return res.status(400).json({ error: "Invalid settings" });
    }

    // Read original to preserve comments/structure. Locked per-path so two
    // overlapping PUTs to the same INI can't interleave their read-modify-write.
    await withFileLock(filePath, async () => {
      let originalContent = "";
      if (fs.existsSync(filePath)) {
        originalContent = fs.readFileSync(filePath, "utf-8");
        await createBackup(`${serverName}.ini`);
      }

      const content = toIni(settings, originalContent);
      writeFileAtomic(filePath, content, "utf-8");
      return content;
    });

    log.info("Saved INI file");
    res.json({ success: true, message: "Settings saved" });
  } catch (error) {
    log.error("Failed to save INI:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
