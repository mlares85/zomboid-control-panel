import express from "express";
import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Files");
import { sanitizeError } from "../../utils/sanitize.js";
import { getServerConfigPath, getServerName, createBackup } from "./context.js";
import { getTemplatesPath } from "./templates.js";

const router = express.Router();

// POST /templates/:id/apply - Apply a template to current config
router.post("/templates/:id/apply", async (req, res) => {
  log.info(`POST /templates/${req.params.id}/apply`);
  try {
    // Sanitize template ID to prevent path traversal
    const safeId = path.basename(req.params.id).replace(/[^a-z0-9_-]/gi, "");
    if (!safeId || safeId !== req.params.id) {
      return res.status(400).json({ error: "Invalid template ID" });
    }

    const { applyIni = true, applySandbox = true } = req.body;

    const templatesPath = await getTemplatesPath();
    const templateFile = path.join(templatesPath, `${safeId}.json`);

    if (!fs.existsSync(templateFile)) {
      return res.status(404).json({ error: "Template not found" });
    }

    const template = JSON.parse(fs.readFileSync(templateFile, "utf-8"));
    const configPath = await getServerConfigPath();
    const serverName = await getServerName();

    const applied = [];

    // Apply INI settings
    if (applyIni && template.iniRaw) {
      const iniPath = path.join(configPath, `${serverName}.ini`);

      // Create backup first
      await createBackup(`${serverName}.ini`);

      // Write the template INI
      fs.writeFileSync(iniPath, template.iniRaw);
      applied.push("INI");
      log.info(`Applied INI from template: ${template.name}`);
    }

    // Apply Sandbox settings
    if (applySandbox && template.sandboxRaw) {
      const sandboxPath = path.join(
        configPath,
        `${serverName}_SandboxVars.lua`,
      );

      // Create backup first
      await createBackup(`${serverName}_SandboxVars.lua`);

      // Write the template sandbox
      fs.writeFileSync(sandboxPath, template.sandboxRaw);
      applied.push("Sandbox");
      log.info(`Applied Sandbox from template: ${template.name}`);
    }

    if (applied.length === 0) {
      return res
        .status(400)
        .json({ error: "No settings to apply from this template" });
    }

    res.json({
      success: true,
      applied,
      message: `Applied ${applied.join(" and ")} settings from "${template.name}"`,
    });
  } catch (error) {
    log.error("Failed to apply template:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// PUT /templates/:id - Update template metadata
router.put("/templates/:id", async (req, res) => {
  try {
    // Sanitize template ID to prevent path traversal
    const safeId = path.basename(req.params.id).replace(/[^a-z0-9_-]/gi, "");
    if (!safeId || safeId !== req.params.id) {
      return res.status(400).json({ error: "Invalid template ID" });
    }

    const { name, description } = req.body;

    const templatesPath = await getTemplatesPath();
    const templateFile = path.join(templatesPath, `${safeId}.json`);

    if (!fs.existsSync(templateFile)) {
      return res.status(404).json({ error: "Template not found" });
    }

    const template = JSON.parse(fs.readFileSync(templateFile, "utf-8"));

    if (name) template.name = name;
    if (description !== undefined) template.description = description;
    template.modified = new Date().toISOString();

    fs.writeFileSync(templateFile, JSON.stringify(template, null, 2));

    res.json({ success: true, message: "Template updated" });
  } catch (error) {
    log.error("Failed to update template:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// DELETE /templates/:id - Delete a template
router.delete("/templates/:id", async (req, res) => {
  log.info(`DELETE /templates/${req.params.id}`);
  try {
    // Sanitize template ID to prevent path traversal
    const safeId = path.basename(req.params.id).replace(/[^a-z0-9_-]/gi, "");
    if (!safeId || safeId !== req.params.id) {
      return res.status(400).json({ error: "Invalid template ID" });
    }

    const templatesPath = await getTemplatesPath();
    const templateFile = path.join(templatesPath, `${safeId}.json`);

    if (!fs.existsSync(templateFile)) {
      return res.status(404).json({ error: "Template not found" });
    }

    fs.unlinkSync(templateFile);
    log.info(`Deleted template: ${req.params.id}`);

    res.json({ success: true, message: "Template deleted" });
  } catch (error) {
    log.error("Failed to delete template:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
