import express from "express";
import { createLogger } from "../../utils/logger.js";
import {
  getModPresets,
  createModPreset,
  updateModPreset,
  deleteModPreset,
} from "../../database/init.js";
import { sanitizeError, sanitizeIniList, sanitizeModIdList } from "../../utils/sanitize.js";
import { getServerConfigPath, getServerName, getSanitizedIniPath } from "../../utils/mods/serverConfig.js";
import { readTextFile, withIniLock } from "../../utils/mods/iniFile.js";
import { LocalFiles } from "../../services/fileAccess/index.js";

const log = createLogger("API:Mods");
const router = express.Router();

// ===== MOD PRESETS =====

// Get all mod presets
router.get("/presets", async (req, res) => {
  try {
    const presets = await getModPresets();
    res.json({ presets });
  } catch (error) {
    log.error(`Failed to get mod presets: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Create a mod preset (save current mods as a preset)
router.post("/presets", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    let { name, description } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Preset name is required" });
    }
    name = name.trim();
    if (!name || name.length > 100) {
      return res
        .status(400)
        .json({ error: "Preset name must be 1-100 characters" });
    }
    if (description && typeof description === "string") {
      description = description.trim().slice(0, 500);
    } else {
      description = "";
    }

    // Read current mods from INI
    const serverConfigPath = await getServerConfigPath();
    const serverName = await getServerName();
    const iniPath = getSanitizedIniPath(serverConfigPath, serverName);

    if (!iniPath) {
      return res.status(400).json({ error: "Invalid server name" });
    }

    if (!(await fileAccess.exists(iniPath))) {
      return res.status(400).json({ error: "Server INI not found" });
    }

    const content = readTextFile(iniPath);
    const workshopMatch = content.match(/^WorkshopItems=(.*)$/m);
    const modsMatch = content.match(/^Mods=(.*)$/m);

    const workshopIds = workshopMatch
      ? workshopMatch[1].split(";").filter(Boolean)
      : [];
    const modIds = modsMatch ? modsMatch[1].split(";").filter(Boolean) : [];

    const preset = await createModPreset(
      name,
      description,
      modIds,
      workshopIds,
    );

    log.info(
      `Created mod preset "${name}" with ${workshopIds.length} workshop items and ${modIds.length} mod IDs`,
    );
    res.json({ preset, message: `Preset "${name}" created successfully` });
  } catch (error) {
    log.error(`Failed to create mod preset: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Update a mod preset
router.put("/presets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Invalid preset ID" });
    }

    const updates = {};
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== "string")
        return res.status(400).json({ error: "name must be a string" });
      const trimmed = req.body.name.trim();
      if (!trimmed || trimmed.length > 100)
        return res.status(400).json({ error: "name must be 1-100 characters" });
      updates.name = trimmed;
    }
    if (req.body.description !== undefined) {
      updates.description =
        typeof req.body.description === "string"
          ? req.body.description.trim().slice(0, 500)
          : "";
    }
    if (req.body.workshopIds !== undefined) {
      if (!Array.isArray(req.body.workshopIds))
        return res.status(400).json({ error: "workshopIds must be an array" });
      updates.workshop_ids = req.body.workshopIds;
    }
    if (req.body.modIds !== undefined) {
      if (!Array.isArray(req.body.modIds))
        return res.status(400).json({ error: "modIds must be an array" });
      updates.mods = req.body.modIds;
    }

    const preset = await updateModPreset(id, updates);
    if (!preset) {
      return res.status(404).json({ error: "Preset not found" });
    }

    log.info(`Updated mod preset: ${updates.name || id}`);
    res.json({ preset, message: "Preset updated successfully" });
  } catch (error) {
    log.error(`Failed to update mod preset: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Delete a mod preset
router.delete("/presets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Invalid preset ID" });
    }

    const deleted = await deleteModPreset(id);

    if (!deleted) {
      return res.status(404).json({ error: "Preset not found" });
    }

    log.info(`Deleted mod preset: ${id}`);
    res.json({ message: "Preset deleted successfully" });
  } catch (error) {
    log.error(`Failed to delete mod preset: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Apply a mod preset (load mods from preset)
router.post("/presets/:id/apply", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const { id } = req.params;
    const presets = await getModPresets();
    const preset = presets.find((p) => String(p.id) === String(id));

    if (!preset) {
      return res.status(404).json({ error: "Preset not found" });
    }

    const serverConfigPath = await getServerConfigPath();
    const serverName = await getServerName();
    const iniPath = getSanitizedIniPath(serverConfigPath, serverName);

    if (!iniPath) {
      return res.status(400).json({ error: "Invalid server name" });
    }

    if (!(await fileAccess.exists(iniPath))) {
      return res.status(400).json({ error: "Server INI not found" });
    }

    await withIniLock(iniPath, async () => {
      let content = readTextFile(iniPath);

      const workshopLine = `WorkshopItems=${sanitizeIniList(preset.workshop_ids || [])}`;
      if (content.includes("WorkshopItems=")) {
        content = content.replace(/^WorkshopItems=.*/m, workshopLine);
      } else {
        content += `\n${workshopLine}`;
      }

      const modsLine = `Mods=${sanitizeModIdList(preset.mods || [])}`;
      if (content.includes("Mods=")) {
        content = content.replace(/^Mods=.*/m, modsLine);
      } else {
        content += `\n${modsLine}`;
      }

      await fileAccess.writeFile(iniPath, content, "utf-8");
    });

    log.info(
      `Applied mod preset "${preset.name}": ${(preset.workshop_ids || []).length} workshop items, ${(preset.mods || []).length} mod IDs`,
    );
    res.json({
      message: `Preset "${preset.name}" applied successfully`,
      workshopCount: (preset.workshop_ids || []).length,
      modCount: (preset.mods || []).length,
    });
  } catch (error) {
    log.error(`Failed to apply mod preset: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
