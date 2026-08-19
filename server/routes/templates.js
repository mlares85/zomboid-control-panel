import express from "express";
import { createLogger } from "../utils/logger.js";
import { sanitizeError } from "../utils/sanitize.js";
import {
  listTemplates,
  getTemplate,
  saveTemplate,
  deleteTemplate,
  exportTemplate,
  importTemplate,
  previewTemplate,
  applyTemplate,
  captureServerConfig,
} from "../services/templateService.js";

const log = createLogger("API:Templates");
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    res.json({ templates: await listTemplates() });
  } catch (error) {
    log.error(`Failed to list templates: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Registered before `/:id` so Express matches this literal path first —
// otherwise `/capture` would be swallowed by `/:id` (with id="capture").
router.get("/capture", async (req, res) => {
  try {
    const { serverId } = req.query;
    if (!serverId) return res.status(400).json({ error: "serverId is required" });

    const result = await captureServerConfig(serverId);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    log.error(`Failed to capture server config: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const template = await getTemplate(req.params.id);
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.json({ template });
  } catch (error) {
    log.error(`Failed to get template: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/", async (req, res) => {
  try {
    const result = await saveTemplate(req.body);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    log.error(`Failed to create template: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/import", async (req, res) => {
  try {
    const result = await importTemplate(req.body?.template ?? req.body);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    log.error(`Failed to import template: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.get("/:id/export", async (req, res) => {
  try {
    const result = await exportTemplate(req.params.id);
    if (!result.success) return res.status(404).json({ error: result.error });
    res
      .set("Content-Disposition", `attachment; filename="${req.params.id}.json"`)
      .json(result.template);
  } catch (error) {
    log.error(`Failed to export template: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/:id/preview", async (req, res) => {
  try {
    const { serverId } = req.body || {};
    if (!serverId) return res.status(400).json({ error: "serverId is required" });

    const result = await previewTemplate(req.params.id, serverId);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    log.error(`Failed to preview template: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/:id/apply", async (req, res) => {
  try {
    const { serverId, options } = req.body || {};
    if (!serverId) return res.status(400).json({ error: "serverId is required" });

    const result = await applyTemplate(req.params.id, serverId, options || {});
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    log.error(`Failed to apply template: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const result = await deleteTemplate(req.params.id);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    log.error(`Failed to delete template: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
