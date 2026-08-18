import express from "express";
import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Files");
import { sanitizeError } from "../../utils/sanitize.js";
import { getServerConfigPath, getServerName } from "./context.js";
import { parseIni } from "./ini.js";
import { LocalFiles } from "../../services/fileAccess/index.js";

const router = express.Router();

// Get templates directory
export async function getTemplatesPath() {
  const configPath = await getServerConfigPath();
  return path.join(configPath, "templates");
}

// Ensure templates directory exists
async function ensureTemplatesDir(fileAccess) {
  const templatesPath = await getTemplatesPath();
  if (!(await fileAccess.exists(templatesPath))) {
    await fileAccess.mkdir(templatesPath, { recursive: true });
  }
  return templatesPath;
}

// GET /templates - List all saved templates
router.get("/templates", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const templatesPath = await ensureTemplatesDir(fileAccess);

    const entries = await fileAccess.readdir(templatesPath);
    const files = (
      await Promise.all(
        entries
          .filter((f) => f.endsWith(".json"))
          .map(async (f) => {
            try {
              const filePath = path.join(templatesPath, f);
              // stat() has no birthtime, so fall back to raw fs for the
              // filesystem-provided created/modified timestamps.
              const stats = fs.statSync(filePath);
              const { success, data, error } = await fileAccess.readFile(filePath);
              if (!success) throw new Error(error);
              const content = JSON.parse(data);
              return {
                id: f.replace(".json", ""),
                name: content.name || f.replace(".json", ""),
                description: content.description || "",
                type: content.type || "both", // 'ini', 'sandbox', or 'both'
                created: content.created || stats.birthtime.toISOString(),
                modified: stats.mtime.toISOString(),
                hasIni: !!content.ini,
                hasSandbox: !!content.sandbox,
              };
            } catch (e) {
              log.debug(`Template read failed for ${f}: ${e.message}`);
              return null;
            }
          }),
      )
    )
      .filter(Boolean)
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));

    res.json({ templates: files });
  } catch (error) {
    log.error("Failed to list templates:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// GET /templates/:id - Get a specific template
router.get("/templates/:id", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    // Sanitize template ID to prevent path traversal
    const safeId = path.basename(req.params.id).replace(/[^a-z0-9_-]/gi, "");
    if (!safeId || safeId !== req.params.id) {
      return res.status(400).json({ error: "Invalid template ID" });
    }

    const templatesPath = await getTemplatesPath();
    const templateFile = path.join(templatesPath, `${safeId}.json`);

    if (!(await fileAccess.exists(templateFile))) {
      return res.status(404).json({ error: "Template not found" });
    }

    const { success, data, error } = await fileAccess.readFile(templateFile);
    if (!success) {
      return res.status(500).json({ error: sanitizeError(error) });
    }
    const content = JSON.parse(data);
    res.json(content);
  } catch (error) {
    log.error("Failed to get template:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// POST /templates - Save current config as a template
router.post("/templates", async (req, res) => {
  log.info("POST /templates (create)");
  try {
    const fileAccess = new LocalFiles();
    const {
      name,
      description,
      includeIni = true,
      includeSandbox = true,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Template name is required" });
    }

    const templatesPath = await ensureTemplatesDir(fileAccess);
    const configPath = await getServerConfigPath();
    const serverName = await getServerName();

    // Generate safe filename from name with uniqueness check
    const baseId = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .substring(0, 50);
    let safeId = baseId;
    let counter = 1;
    while (await fileAccess.exists(path.join(templatesPath, `${safeId}.json`))) {
      safeId = `${baseId}_${counter++}`;
      if (counter > 100) {
        return res
          .status(400)
          .json({ error: "Too many templates with similar names" });
      }
    }
    const templateFile = path.join(templatesPath, `${safeId}.json`);

    const template = {
      name,
      description: description || "",
      type:
        includeIni && includeSandbox ? "both" : includeIni ? "ini" : "sandbox",
      created: new Date().toISOString(),
      serverName,
    };

    // Read current INI settings
    if (includeIni) {
      const iniPath = path.join(configPath, `${serverName}.ini`);
      if (await fileAccess.exists(iniPath)) {
        const { success, data: iniContent, error } = await fileAccess.readFile(iniPath);
        if (!success) throw new Error(error);
        template.ini = parseIni(iniContent);
        template.iniRaw = iniContent;
      }
    }

    // Read current Sandbox settings
    if (includeSandbox) {
      const sandboxPath = path.join(
        configPath,
        `${serverName}_SandboxVars.lua`,
      );
      if (await fileAccess.exists(sandboxPath)) {
        const { success, data, error } = await fileAccess.readFile(sandboxPath);
        if (!success) throw new Error(error);
        template.sandboxRaw = data;
      }
    }

    const writeResult = await fileAccess.writeFile(
      templateFile,
      JSON.stringify(template, null, 2),
    );
    if (!writeResult.success) {
      throw new Error(writeResult.error);
    }
    log.info(`Created template: ${name} (${safeId})`);

    res.json({
      success: true,
      id: safeId,
      name,
      message: `Template "${name}" saved successfully`,
    });
  } catch (error) {
    log.error("Failed to save template:", error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
