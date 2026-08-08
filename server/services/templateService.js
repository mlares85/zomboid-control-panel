// Simulation template library: a curated set of built-in PZ rulesets (see
// server/data/templates/*.json) plus user-created templates persisted in
// db.json. Templates are sparse overrides — applying one only ever touches
// the keys it defines, never resets a server to "everything else default".
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { createLogger } from "../utils/logger.js";
import { getServer } from "../database/init.js";
import {
  getUserTemplates,
  getUserTemplate,
  saveUserTemplate,
  deleteUserTemplate,
} from "../database/init.js";
import {
  createTemplate,
  validateTemplate,
  diffTemplate as computeDiff,
  DEFAULT_INI_EXCLUSIONS,
} from "../utils/templateSchema.js";
import {
  readIniValues,
  mergeIniValues,
  readSandboxValue,
  mergeSandboxSections,
  backupFile,
  writeFile,
} from "../utils/templateFiles.js";

const log = createLogger("TemplateService");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN_DIR = path.join(__dirname, "../data/templates");

let builtinCache = null;

function loadBuiltinTemplates() {
  if (builtinCache) return builtinCache;
  const files = fs.existsSync(BUILTIN_DIR)
    ? fs.readdirSync(BUILTIN_DIR).filter((f) => f.endsWith(".json"))
    : [];
  builtinCache = files
    .map((f) => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(BUILTIN_DIR, f), "utf-8"));
        return { ...raw, isBuiltin: true };
      } catch (err) {
        log.error(`Failed to load built-in template ${f}: ${err.message}`);
        return null;
      }
    })
    .filter(Boolean);
  return builtinCache;
}

// Tests need a clean slate between runs that write different fixture files
// into a stubbed BUILTIN_DIR — production never calls this.
export function _resetBuiltinCacheForTests() {
  builtinCache = null;
}

export async function listTemplates() {
  const builtins = loadBuiltinTemplates();
  const userTemplates = (await getUserTemplates()).map((t) => ({
    ...t,
    isBuiltin: false,
  }));
  return [...builtins, ...userTemplates];
}

export async function getTemplate(id) {
  const builtin = loadBuiltinTemplates().find((t) => t.meta.id === id);
  if (builtin) return builtin;
  const userTemplate = await getUserTemplate(id);
  return userTemplate ? { ...userTemplate, isBuiltin: false } : null;
}

export async function saveTemplate(input) {
  const hasId = typeof input?.meta?.id === "string" && input.meta.id;
  if (hasId && loadBuiltinTemplates().some((t) => t.meta.id === input.meta.id)) {
    return { success: false, error: "Cannot overwrite a built-in template" };
  }

  const template = hasId && input.schemaVersion ? input : createTemplate(input || {});
  const { valid, errors } = validateTemplate(template);
  if (!valid) return { success: false, error: errors.join("; ") };

  const saved = await saveUserTemplate(template);
  return { success: true, template: saved };
}

export async function deleteTemplate(id) {
  if (loadBuiltinTemplates().some((t) => t.meta.id === id)) {
    return { success: false, error: "Cannot delete a built-in template" };
  }
  const deleted = await deleteUserTemplate(id);
  return deleted ? { success: true } : { success: false, error: "Template not found" };
}

export async function exportTemplate(id) {
  const template = await getTemplate(id);
  if (!template) return { success: false, error: "Template not found" };
  const { isBuiltin: _isBuiltin, ...exportable } = template;
  return { success: true, template: exportable };
}

export async function importTemplate(json) {
  const { valid, errors } = validateTemplate(json);
  if (!valid) return { success: false, error: errors.join("; ") };

  // Always mint a fresh id so an imported file can never silently collide
  // with (or overwrite) an existing built-in or user template.
  const template = { ...json, meta: { ...json.meta, id: randomUUID() } };
  const saved = await saveUserTemplate(template);
  return { success: true, template: saved };
}

function resolveServerPaths(server) {
  const configDir = server?.serverConfigPath
    ? server.serverConfigPath
    : server?.zomboidDataPath
      ? path.join(server.zomboidDataPath, "Server")
      : null;
  if (!configDir || !server?.serverName) return null;
  return {
    iniPath: path.join(configDir, `${server.serverName}.ini`),
    sandboxPath: path.join(configDir, `${server.serverName}_SandboxVars.lua`),
  };
}

async function readCurrentConfig(template, paths) {
  const serverIni = {};
  if (fs.existsSync(paths.iniPath)) {
    const content = fs.readFileSync(paths.iniPath, "utf-8");
    Object.assign(serverIni, readIniValues(content, Object.keys(template.serverIni || {})));
  }

  const sandboxVars = {};
  if (fs.existsSync(paths.sandboxPath)) {
    const content = fs.readFileSync(paths.sandboxPath, "utf-8");
    for (const [section, values] of Object.entries(template.sandboxVars || {})) {
      sandboxVars[section] = {};
      for (const key of Object.keys(values || {})) {
        sandboxVars[section][key] = readSandboxValue(content, section, key);
      }
    }
  }

  return { serverIni, sandboxVars };
}

export async function previewTemplate(templateId, serverId) {
  const template = await getTemplate(templateId);
  if (!template) return { success: false, error: "Template not found" };

  const server = await getServer(serverId);
  if (!server) return { success: false, error: "Server not found" };

  const paths = resolveServerPaths(server);
  if (!paths) return { success: false, error: "Server has no configured config path" };

  const currentConfig = await readCurrentConfig(template, paths);
  return { success: true, diff: computeDiff(template, currentConfig) };
}

function applyIniChanges(template, paths, backup, result) {
  const exclusions = template.iniExclusions || DEFAULT_INI_EXCLUSIONS;
  const updates = Object.fromEntries(
    Object.entries(template.serverIni || {}).filter(([key]) => !exclusions.includes(key)),
  );
  if (Object.keys(updates).length === 0) return;

  const existing = fs.existsSync(paths.iniPath) ? fs.readFileSync(paths.iniPath, "utf-8") : "";
  if (backup) {
    const backupPath = backupFile(paths.iniPath);
    if (backupPath) result.backups.push(backupPath);
  }
  writeFile(paths.iniPath, mergeIniValues(existing, updates));
  result.ini = { appliedKeys: Object.keys(updates) };
}

function applySandboxChanges(template, paths, backup, result) {
  if (Object.keys(template.sandboxVars || {}).length === 0) return;

  if (!fs.existsSync(paths.sandboxPath)) {
    result.sandbox = {
      skipped: true,
      reason: "SandboxVars.lua not found — start the server once to generate it.",
    };
    return;
  }

  const existing = fs.readFileSync(paths.sandboxPath, "utf-8");
  if (backup) {
    const backupPath = backupFile(paths.sandboxPath);
    if (backupPath) result.backups.push(backupPath);
  }
  const { content, applied, skipped } = mergeSandboxSections(existing, template.sandboxVars);
  writeFile(paths.sandboxPath, content);
  result.sandbox = { applied, skipped };
}

export async function applyTemplate(templateId, serverId, options = {}) {
  const template = await getTemplate(templateId);
  if (!template) return { success: false, error: "Template not found" };

  const server = await getServer(serverId);
  if (!server) return { success: false, error: "Server not found" };
  if (server.isRemote) {
    return {
      success: false,
      error: "Applying templates to remote servers is not supported yet.",
    };
  }

  const paths = resolveServerPaths(server);
  if (!paths) return { success: false, error: "Server has no configured config path" };

  const backup = options.backup !== false;
  const result = { success: true, ini: null, sandbox: null, backups: [] };
  if (options.applyIni !== false) applyIniChanges(template, paths, backup, result);
  if (options.applySandbox !== false) applySandboxChanges(template, paths, backup, result);

  log.info(`Applied template "${template.meta.name}" to server ${server.id}`);
  return result;
}
