import express from "express";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Files");
import { sanitizeError } from "../../utils/sanitize.js";
import { withFileLock, writeFileAtomic } from "../../utils/fileWriteQueue.js";
import { getServerConfigPath, getServerName, createBackup } from "./context.js";
import { LocalFiles } from "../../services/fileAccess/index.js";
import { escapeLuaString } from "./luaEscape.js";

const router = express.Router();

// Parse spawn regions lua
function parseSpawnRegions(content) {
  const regions = [];

  try {
    // Match patterns like { name = "Muldraugh, KY", file = "path" } or { name = "...", serverfile = "..." }
    // Handle both 'file' and 'serverfile' keys
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      // Skip comments
      if (line.trim().startsWith("--")) continue;

      // Try to match file or serverfile
      const nameMatch = line.match(/name\s*=\s*"([^"]+)"/);
      const fileMatch = line.match(/(?:server)?file\s*=\s*"([^"]+)"/);

      if (nameMatch && fileMatch) {
        regions.push({
          name: nameMatch[1],
          file: fileMatch[1],
          isServerFile: line.includes("serverfile"),
        });
      }
    }
  } catch (error) {
    log.error("Failed to parse spawn regions:", error);
  }

  return regions;
}

// Convert spawn regions to Lua
function toSpawnRegions(regions, serverName) {
  const lines = [`function SpawnRegions()`];
  lines.push(`        return {`);

  for (const r of regions) {
    const safeName = escapeLuaString(r.name);
    const safeFile = escapeLuaString(r.file);
    if (r.isServerFile) {
      lines.push(
        `                { name = "${safeName}", serverfile = "${safeFile}" },`,
      );
    } else {
      lines.push(
        `                { name = "${safeName}", file = "${safeFile}" },`,
      );
    }
  }

  lines.push(`        }`);
  lines.push(`end`);
  return lines.join("\n");
}

// Get spawn regions
router.get("/spawnregions", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const configPath = await getServerConfigPath();
    const serverName = await getServerName();
    const filePath = path.join(configPath, `${serverName}_spawnregions.lua`);

    if (!(await fileAccess.exists(filePath))) {
      return res
        .status(404)
        .json({ error: "Spawn regions file not found", path: filePath });
    }

    const { success, data: content, error } = await fileAccess.readFile(filePath);
    if (!success) {
      return res.status(500).json({ error: sanitizeError(error) });
    }
    const regions = parseSpawnRegions(content);

    res.json({ spawnregions: regions, path: filePath });
  } catch (error) {
    log.error("Failed to read spawn regions:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Save spawn regions
router.put("/spawnregions", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const configPath = await getServerConfigPath();
    const serverName = await getServerName();
    const filePath = path.join(configPath, `${serverName}_spawnregions.lua`);
    const { spawnregions } = req.body;

    if (!Array.isArray(spawnregions)) {
      return res.status(400).json({ error: "Spawn regions array required" });
    }

    await withFileLock(filePath, async () => {
      if (await fileAccess.exists(filePath)) {
        await createBackup(`${serverName}_spawnregions.lua`);
      }

      const newContent = toSpawnRegions(spawnregions, serverName);
      writeFileAtomic(filePath, newContent, "utf-8");
    });

    log.info("Saved spawn regions file");
    res.json({ success: true, message: "Spawn regions saved" });
  } catch (error) {
    log.error("Failed to save spawn regions:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
