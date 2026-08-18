import express from "express";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Files");
import { sanitizeError } from "../../utils/sanitize.js";
import { withFileLock, writeFileAtomic } from "../../utils/fileWriteQueue.js";
import { getServerConfigPath, getServerName, createBackup } from "./context.js";
import { LocalFiles } from "../../services/fileAccess/index.js";

const router = express.Router();

// Parse spawn points lua - handles profession-based structure
function parseSpawnPoints(content) {
  const professions = {};

  try {
    // First, find profession blocks like: unemployed = { ... }
    // The format is: professionName = { { worldX = ..., ... }, { worldX = ..., ... } }
    const professionPattern = /(\w+)\s*=\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
    let profMatch;

    while ((profMatch = professionPattern.exec(content)) !== null) {
      const profName = profMatch[1];
      const profContent = profMatch[2];

      // Skip 'return' as it's not a profession
      if (profName === "return") continue;

      const points = [];
      // Match spawn point entries - posZ is optional
      const pointPattern =
        /\{\s*worldX\s*=\s*(\d+)\s*,\s*worldY\s*=\s*(\d+)\s*,\s*posX\s*=\s*([\d.]+)\s*,\s*posY\s*=\s*([\d.]+)(?:\s*,\s*posZ\s*=\s*(\d+))?\s*\}/g;
      let pointMatch;

      while ((pointMatch = pointPattern.exec(profContent)) !== null) {
        points.push({
          worldX: parseInt(pointMatch[1], 10),
          worldY: parseInt(pointMatch[2], 10),
          posX: parseFloat(pointMatch[3]),
          posY: parseFloat(pointMatch[4]),
          posZ: pointMatch[5] ? parseInt(pointMatch[5], 10) : 0,
        });
      }

      if (points.length > 0) {
        professions[profName] = points;
      }
    }
  } catch (error) {
    log.error("Failed to parse spawn points:", error);
  }

  return professions;
}

// Convert spawn points to Lua - handles profession-based structure
function toSpawnPoints(professions, serverName) {
  const lines = [`function SpawnPoints()`];
  lines.push(`\treturn {`);

  for (const [profName, points] of Object.entries(professions)) {
    // Validate profession name is a safe Lua identifier
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(profName)) {
      log.warn(`Invalid profession name skipped in spawnpoints: ${profName}`);
      continue;
    }
    lines.push(`\t\t${profName} = {`);
    for (const p of points) {
      // Validate coordinates are finite numbers to prevent Lua injection
      const wx = Number.isFinite(Number(p.worldX)) ? Number(p.worldX) : 0;
      const wy = Number.isFinite(Number(p.worldY)) ? Number(p.worldY) : 0;
      const px = Number.isFinite(Number(p.posX)) ? Number(p.posX) : 0;
      const py = Number.isFinite(Number(p.posY)) ? Number(p.posY) : 0;
      const pz = Number.isFinite(Number(p.posZ)) ? Number(p.posZ) : 0;
      if (pz && pz !== 0) {
        lines.push(
          `\t\t\t{ worldX = ${wx}, worldY = ${wy}, posX = ${px}, posY = ${py}, posZ = ${pz} }`,
        );
      } else {
        lines.push(
          `\t\t\t{ worldX = ${wx}, worldY = ${wy}, posX = ${px}, posY = ${py} }`,
        );
      }
    }
    lines.push(`\t\t}`);
  }

  lines.push(`\t}`);
  lines.push(`end`);
  return lines.join("\n");
}

// Get spawn points
router.get("/spawnpoints", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const configPath = await getServerConfigPath();
    const serverName = await getServerName();
    const filePath = path.join(configPath, `${serverName}_spawnpoints.lua`);

    if (!(await fileAccess.exists(filePath))) {
      return res
        .status(404)
        .json({ error: "Spawn points file not found", path: filePath });
    }

    const { success, data: content, error } = await fileAccess.readFile(filePath);
    if (!success) {
      return res.status(500).json({ error: sanitizeError(error) });
    }
    const points = parseSpawnPoints(content);

    res.json({ spawnpoints: points, path: filePath });
  } catch (error) {
    log.error("Failed to read spawn points:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Save spawn points
router.put("/spawnpoints", async (req, res) => {
  try {
    log.info("PUT /spawnpoints");
    const fileAccess = new LocalFiles();
    const configPath = await getServerConfigPath();
    const serverName = await getServerName();
    const filePath = path.join(configPath, `${serverName}_spawnpoints.lua`);
    const { spawnpoints } = req.body;

    if (!spawnpoints || typeof spawnpoints !== "object") {
      return res
        .status(400)
        .json({ error: "Spawn points object required (keyed by profession)" });
    }

    await withFileLock(filePath, async () => {
      if (await fileAccess.exists(filePath)) {
        await createBackup(`${serverName}_spawnpoints.lua`);
      }

      const newContent = toSpawnPoints(spawnpoints, serverName);
      writeFileAtomic(filePath, newContent, "utf-8");
    });

    log.info("Saved spawn points file");
    res.json({ success: true, message: "Spawn points saved" });
  } catch (error) {
    log.error("Failed to save spawn points:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
