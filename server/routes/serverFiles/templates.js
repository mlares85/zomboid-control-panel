import express from "express";
import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Files");
import { sanitizeError } from "../../utils/sanitize.js";
import { getServerConfigPath, getServerName } from "./context.js";
import { parseIni } from "./ini.js";

const router = express.Router();

// Get templates directory
export async function getTemplatesPath() {
  const configPath = await getServerConfigPath();
  return path.join(configPath, "templates");
}

// Ensure templates directory exists
async function ensureTemplatesDir() {
  const templatesPath = await getTemplatesPath();
  if (!fs.existsSync(templatesPath)) {
    fs.mkdirSync(templatesPath, { recursive: true });
  }
  return templatesPath;
}

// GET /templates - List all saved templates
router.get("/templates", async (req, res) => {
  try {
    const templatesPath = await ensureTemplatesDir();

    const files = fs
      .readdirSync(templatesPath)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          const filePath = path.join(templatesPath, f);
          const stats = fs.statSync(filePath);
          const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
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
      })
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

    const content = JSON.parse(fs.readFileSync(templateFile, "utf-8"));
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
    const {
      name,
      description,
      includeIni = true,
      includeSandbox = true,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Template name is required" });
    }

    const templatesPath = await ensureTemplatesDir();
    const configPath = await getServerConfigPath();
    const serverName = await getServerName();

    // Generate safe filename from name with uniqueness check
    const baseId = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .substring(0, 50);
    let safeId = baseId;
    let counter = 1;
    while (fs.existsSync(path.join(templatesPath, `${safeId}.json`))) {
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
      if (fs.existsSync(iniPath)) {
        const iniContent = fs.readFileSync(iniPath, "utf-8");
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
      if (fs.existsSync(sandboxPath)) {
        template.sandboxRaw = fs.readFileSync(sandboxPath, "utf-8");
      }
    }

    fs.writeFileSync(templateFile, JSON.stringify(template, null, 2));
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
