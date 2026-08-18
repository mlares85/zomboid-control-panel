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
  captureModsFromIni,
  applyModsToIni,
  backupFile,
  writeFile,
} from "../utils/templateFiles.js";
import { LocalFiles } from "./fileAccess/index.js";

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

async function readCurrentConfig(template, paths, fileAccess) {
  const serverIni = {};
  const iniResult = await fileAccess.readFile(paths.iniPath);
  if (iniResult.success) {
    Object.assign(serverIni, readIniValues(iniResult.data, Object.keys(template.serverIni || {})));
  }

  const sandboxVars = {};
  const sandboxResult = await fileAccess.readFile(paths.sandboxPath);
  if (sandboxResult.success) {
    for (const [section, values] of Object.entries(template.sandboxVars || {})) {
      sandboxVars[section] = {};
      for (const key of Object.keys(values || {})) {
        sandboxVars[section][key] = readSandboxValue(sandboxResult.data, section, key);
      }
    }
  }

  return { serverIni, sandboxVars };
}

export async function previewTemplate(templateId, serverId, { fileAccess } = {}) {
  const template = await getTemplate(templateId);
  if (!template) return { success: false, error: "Template not found" };

  const server = await getServer(serverId);
  if (!server) return { success: false, error: "Server not found" };

  const paths = resolveServerPaths(server);
  if (!paths) return { success: false, error: "Server has no configured config path" };

  const fa = fileAccess || new LocalFiles();
  const currentConfig = await readCurrentConfig(template, paths, fa);
  return { success: true, diff: computeDiff(template, currentConfig) };
}

async function applyIniChanges(template, paths, backup, result, fileAccess) {
  const exclusions = template.iniExclusions || DEFAULT_INI_EXCLUSIONS;
  const updates = Object.fromEntries(
    Object.entries(template.serverIni || {}).filter(([key]) => !exclusions.includes(key)),
  );
  if (Object.keys(updates).length === 0) return;

  const iniResult = await fileAccess.readFile(paths.iniPath);
  const existing = iniResult.success ? iniResult.data : "";
  if (backup) {
    const backupPath = backupFile(paths.iniPath);
    if (backupPath) result.backups.push(backupPath);
  }
  writeFile(paths.iniPath, mergeIniValues(existing, updates));
  result.ini = { appliedKeys: Object.keys(updates) };
}

async function applySandboxChanges(template, paths, backup, result, fileAccess) {
  if (Object.keys(template.sandboxVars || {}).length === 0) return;

  if (!(await fileAccess.exists(paths.sandboxPath))) {
    result.sandbox = {
      skipped: true,
      reason: "SandboxVars.lua not found — start the server once to generate it.",
    };
    return;
  }

  const sandboxResult = await fileAccess.readFile(paths.sandboxPath);
  if (!sandboxResult.success) return;
  if (backup) {
    const backupPath = backupFile(paths.sandboxPath);
    if (backupPath) result.backups.push(backupPath);
  }
  const { content, applied, skipped } = mergeSandboxSections(sandboxResult.data, template.sandboxVars);
  writeFile(paths.sandboxPath, content);
  result.sandbox = { applied, skipped };
}

async function applyModChanges(template, paths, backup, result, fileAccess) {
  const mods = template.mods;
  if (!Array.isArray(mods) || mods.length === 0) return;

  const iniResult = await fileAccess.readFile(paths.iniPath);
  const existing = iniResult.success ? iniResult.data : "";
  if (backup && !result.backups.length) {
    const backupPath = backupFile(paths.iniPath);
    if (backupPath) result.backups.push(backupPath);
  }
  const updated = applyModsToIni(existing, mods);
  writeFile(paths.iniPath, updated);

  const newWorkshop = mods.filter((m) => !existing.includes(m.workshopId)).length;
  const newMods = mods.filter((m) => m.modId && !existing.includes(m.modId)).length;
  result.mods = { added: { workshopItems: newWorkshop, modIds: newMods } };
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

  const fa = options.fileAccess || new LocalFiles();
  const backup = options.backup !== false;
  const result = { success: true, ini: null, sandbox: null, mods: null, backups: [] };
  if (options.applyIni !== false) await applyIniChanges(template, paths, backup, result, fa);
  if (options.applyMods !== false) await applyModChanges(template, paths, backup, result, fa);
  if (options.applySandbox !== false) await applySandboxChanges(template, paths, backup, result, fa);

  log.info(`Applied template "${template.meta.name}" to server ${server.id}`);
  return result;
}

export async function captureServerConfig(serverId, { fileAccess } = {}) {
  const server = await getServer(serverId);
  if (!server) return { success: false, error: "Server not found" };

  const paths = resolveServerPaths(server);
  if (!paths) return { success: false, error: "Server has no configured config path" };

  const fa = fileAccess || new LocalFiles();
  const iniResult = await fa.readFile(paths.iniPath);
  const iniContent = iniResult.success ? iniResult.data : "";

  return {
    success: true,
    config: { mods: captureModsFromIni(iniContent) },
  };
}
