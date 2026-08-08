import fs from "fs";
import path from "path";
import { checkSandboxBraceBalance } from "../../serverFiles.js";
import {
  getCandidateZomboidPaths,
  inspectZomboidPath,
} from "../../../utils/zomboidPaths.js";

const SUPPORT_INI_KEYS = [
  "DefaultPort",
  "RCONPort",
  "Public",
  "Open",
  "PauseEmpty",
  "MaxPlayers",
  "MaxAccountsPerUser",
  "SteamVAC",
  "DoLuaChecksum",
  "UsernameDisguises",
  "HideDisguisedUserName",
  "AntiCheatProtectionType",
];

export async function buildServerConfigSummary(activeServer) {
  const configDir = activeServer?.serverConfigPath;
  const serverName = activeServer?.serverName || activeServer?.name;
  if (!configDir || !serverName) {
    return { available: false, reason: "Active server configuration is not set" };
  }

  const iniPath = path.join(configDir, `${serverName}.ini`);
  const sandboxPath = path.join(configDir, `${serverName}_SandboxVars.lua`);
  const result = {
    available: false,
    serverName,
    ini: { path: iniPath, exists: false },
    sandbox: { path: sandboxPath, exists: false },
  };

  try {
    const iniContent = await fs.promises.readFile(iniPath, "utf8");
    const values = {};
    for (const raw of iniContent.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith(";")) continue;
      const separator = line.indexOf("=");
      if (separator <= 0) continue;
      values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
    const splitList = (value) =>
      (value || "")
        .split(";")
        .map((entry) => entry.trim())
        .filter(Boolean);
    const safeSettings = Object.fromEntries(
      SUPPORT_INI_KEYS.filter((key) => values[key] !== undefined).map((key) => [
        key,
        values[key],
      ]),
    );
    result.available = true;
    result.ini = {
      ...result.ini,
      exists: true,
      sha256: crypto.createHash("sha256").update(iniContent).digest("hex"),
      settings: safeSettings,
      mods: splitList(values.Mods),
      workshopItems: splitList(values.WorkshopItems),
      map: splitList(values.Map),
    };
  } catch (error) {
    result.ini.error = error.message;
  }

  try {
    const sandboxContent = await fs.promises.readFile(sandboxPath, "utf8");
    const braces = checkSandboxBraceBalance(sandboxContent);
    result.sandbox = {
      ...result.sandbox,
      exists: true,
      bytes: Buffer.byteLength(sandboxContent),
      sha256: crypto.createHash("sha256").update(sandboxContent).digest("hex"),
      braceBalance: braces,
    };
  } catch (error) {
    result.sandbox.error = error.message;
  }

  return result;
}

export async function buildPzBuildInfo(activeServer) {
  const installPath = activeServer?.installPath;
  if (!installPath) return { available: false, reason: "Install path is not set" };

  const manifestPath = path.join(
    installPath,
    "steamapps",
    "appmanifest_380870.acf",
  );
  try {
    const manifest = await fs.promises.readFile(manifestPath, "utf8");
    const valueFor = (key) =>
      manifest.match(new RegExp(`"${key}"\\s+"([^"]+)"`))?.[1] || null;
    const lastUpdated = valueFor("LastUpdated");
    return {
      available: true,
      appId: valueFor("appid") || "380870",
      buildId: valueFor("buildid"),
      branch: valueFor("BetaKey") || "public",
      lastUpdated: lastUpdated
        ? new Date(Number(lastUpdated) * 1000).toISOString()
        : null,
    };
  } catch (error) {
    return { available: false, manifestPath, error: error.message };
  }
}

async function listDir(target, { recurseInto = [], maxEntries = 200 } = {}) {
  if (!target) return null;
  try {
    const stat = await fs.promises.stat(target);
    if (!stat.isDirectory()) return { path: target, error: "not a directory" };
  } catch (e) {
    return { path: target, error: e.message };
  }
  try {
    const items = await fs.promises.readdir(target, { withFileTypes: true });
    const out = [];
    for (const it of items.slice(0, maxEntries)) {
      try {
        const full = path.join(target, it.name);
        const s = await fs.promises.stat(full);
        const entry = {
          name: it.name,
          type: it.isDirectory() ? "dir" : it.isFile() ? "file" : "other",
          size: s.size,
          modified: s.mtime.toISOString(),
        };
        if (it.isDirectory() && recurseInto.includes(it.name)) {
          entry.children = await listDir(full, { maxEntries: 100 });
        }
        out.push(entry);
      } catch {
        out.push({ name: it.name, error: "stat failed" });
      }
    }
    return {
      path: target,
      truncatedAt: items.length > maxEntries ? maxEntries : null,
      totalEntries: items.length,
      entries: out,
    };
  } catch (e) {
    return { path: target, error: e.message };
  }
}

export async function buildZomboidPaths(activeServer) {
  const configured = activeServer?.zomboidDataPath || null;
  const inspection = configured ? inspectZomboidPath(configured) : null;
  let candidates = [];
  try {
    candidates = getCandidateZomboidPaths();
  } catch (e) {
    candidates = [{ _error: e.message }];
  }

  const root = configured;
  return {
    configuredPath: configured,
    installPath: activeServer?.installPath || null,
    inspection,
    candidates,
    listings: {
      root: await listDir(root),
      saves: root
        ? await listDir(path.join(root, "Saves"), {
            recurseInto: ["Multiplayer"],
          })
        : null,
      server: root ? await listDir(path.join(root, "Server")) : null,
      logs: root ? await listDir(path.join(root, "Logs")) : null,
      mods: root ? await listDir(path.join(root, "mods")) : null,
      workshop: root ? await listDir(path.join(root, "Workshop")) : null,
      panelBridge: root
        ? await listDir(path.join(root, "panelbridge"), {
            recurseInto: ["default"],
          })
        : null,
      install: activeServer?.installPath
        ? await listDir(activeServer.installPath)
        : null,
      installLogs: activeServer?.installPath
        ? await listDir(path.join(activeServer.installPath, "logs"))
        : null,
    },
  };
}
