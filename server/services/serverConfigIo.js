/**
 * Config I/O for the Project Zomboid server .ini file — locating the config
 * file among its several possible on-disk locations, parsing it, writing
 * updates back with per-path locking, and pulling specific values (mod
 * list, game port) out of the parsed result.
 *
 * Extracted from ServerManager so this logic can be unit tested as pure/
 * dependency-injected functions instead of through the full manager.
 */
import path from "path";
import { withFileLock } from "../utils/fileWriteQueue.js";
import { escapeRegExp } from "../utils/regex.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("ServerConfigIo");

/**
 * Parse PZ's `key=value` .ini format into a flat object. Blank lines and
 * `#`/`;`-prefixed comments are skipped; `=` inside a value is preserved.
 */
export function parseIni(content) {
  const config = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith(";")) {
      const [key, ...valueParts] = trimmed.split("=");
      if (key && valueParts.length > 0) {
        config[key.trim()] = valueParts.join("=").trim();
      }
    }
  }
  return config;
}

/**
 * PZ has moved where it writes the server .ini across versions, and users'
 * save directories can predate that move — check each known location in
 * order and use the first one that exists.
 */
export async function findServerConfigPath(savePath, serverName, fileAccess) {
  if (!savePath) return null;
  const candidates = [
    path.join(savePath, "Server", `${serverName}.ini`),
    path.join(savePath, `${serverName}.ini`),
    path.join(savePath, "servertest.ini"),
    path.join(savePath, "serveroptions.ini"),
  ];
  for (const p of candidates) {
    if (await fileAccess.exists(p)) return p;
  }
  return null;
}

export async function readServerConfig(savePath, serverName, fileAccess) {
  const configPath = await findServerConfigPath(
    savePath,
    serverName,
    fileAccess,
  );
  if (!configPath) return null;
  const result = await fileAccess.readFile(configPath, "utf-8");
  if (!result.success) return null;
  return parseIni(result.data);
}

/**
 * Write `config` key/value pairs into the server .ini, preserving existing
 * comments/structure by patching matching `key=...` lines in place and
 * appending any keys not already present. Locked per resolved path so an
 * overlapping save can't interleave its read-modify-write with this one.
 */
export async function writeServerConfig(
  savePath,
  serverName,
  config,
  fileAccess,
) {
  const serverIni = serverName ? `${serverName}.ini` : "servertest.ini";
  const serverSubdirPath = path.join(savePath, "Server", serverIni);
  let configPath;
  if (await fileAccess.exists(serverSubdirPath)) {
    configPath = serverSubdirPath;
  } else {
    configPath = path.join(savePath, serverIni);
    if (!(await fileAccess.exists(configPath))) {
      configPath = path.join(savePath, "servertest.ini");
    }
  }

  await withFileLock(configPath, async () => {
    let content = "";
    if (await fileAccess.exists(configPath)) {
      const readResult = await fileAccess.readFile(configPath, "utf-8");
      content = readResult.success ? readResult.data : "";
    }

    for (const [key, value] of Object.entries(config)) {
      // Validate key is a valid identifier (alphanumeric and underscore only)
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        log.warn(`Invalid config key skipped: ${key}`);
        continue;
      }
      const escapedKey = escapeRegExp(key);
      const regex = new RegExp(`^${escapedKey}=.*$`, "m");
      // Strip newlines from values to prevent INI injection
      const safeValue = String(value).replace(/[\r\n]/g, "");
      if (content.match(regex)) {
        content = content.replace(regex, `${key}=${safeValue}`);
      } else {
        content += `\n${key}=${safeValue}`;
      }
    }

    const writeResult = await fileAccess.writeFile(configPath, content, {
      atomic: true,
    });
    if (!writeResult.success) throw new Error(writeResult.error);
  });
}

export function extractModList(config) {
  if (!config?.Mods) return [];
  const mods = config.Mods.split(";").filter((m) => m.trim());
  const workshopIds = config.WorkshopItems
    ? config.WorkshopItems.split(";").filter((m) => m.trim())
    : [];
  return mods.map((mod, index) => ({
    name: mod,
    workshopId: workshopIds[index] || null,
  }));
}

export function extractGamePort(config) {
  return config?.DefaultPort ? parseInt(config.DefaultPort, 10) : null;
}
