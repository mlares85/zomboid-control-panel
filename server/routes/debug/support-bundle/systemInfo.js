import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { getDataPaths } from "../../../utils/paths.js";
import {
  getAllSettings,
  getDb,
  getScheduledTasks,
  getTrackedMods,
} from "../../../database/init.js";
import { sanitizeForBundle } from "./sanitize.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readPanelVersion() {
  const candidates = [
    path.join(__dirname, "..", "..", "..", "..", "package.json"),
    path.join(process.cwd(), "package.json"),
    process.execPath
      ? path.join(path.dirname(process.execPath), "package.json")
      : null,
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      const txt = await fs.promises.readFile(p, "utf8");
      const pkg = JSON.parse(txt);
      if (pkg?.version) return pkg.version;
    } catch {
      /* try next */
    }
  }
  return "unknown";
}

async function safeStatfs(target) {
  if (!target || typeof fs.promises.statfs !== "function") return null;
  try {
    const s = await fs.promises.statfs(target);
    const totalBytes = Number(s.blocks) * Number(s.bsize);
    const freeBytes = Number(s.bavail) * Number(s.bsize);
    return {
      totalBytes,
      freeBytes,
      totalGB: +(totalBytes / 1024 ** 3).toFixed(2),
      freeGB: +(freeBytes / 1024 ** 3).toFixed(2),
      percentFree:
        totalBytes > 0 ? +((freeBytes / totalBytes) * 100).toFixed(1) : null,
    };
  } catch (e) {
    return { error: e.message };
  }
}

export async function buildSystemInfo(activeServer) {
  const version = await readPanelVersion();
  const isPkg = typeof process.pkg !== "undefined";
  const paths = getDataPaths();
  const cpus = os.cpus();

  return {
    panel: {
      version,
      isPkg,
      execPath: process.execPath,
      cwd: process.cwd(),
      argv: process.argv
        .slice(1)
        .map((a) => (a.length > 200 ? a.slice(0, 200) + "…" : a)),
      uptimeSeconds: Math.round(process.uptime()),
      pid: process.pid,
      memoryUsage: process.memoryUsage(),
    },
    runtime: {
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      openssl: process.versions.openssl,
    },
    os: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      type: os.type(),
      hostname: os.hostname().replace(/[^a-zA-Z0-9._-]/g, "?"),
      uptimeSeconds: Math.round(os.uptime()),
      totalMemBytes: os.totalmem(),
      freeMemBytes: os.freemem(),
      totalMemGB: +(os.totalmem() / 1024 ** 3).toFixed(2),
      freeMemGB: +(os.freemem() / 1024 ** 3).toFixed(2),
      loadavg: os.loadavg(),
      cpu: cpus[0]?.model || "unknown",
      cpuCount: cpus.length,
      tmpdir: os.tmpdir(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    disk: {
      panelDataDir: await safeStatfs(paths.dataDir),
      zomboidDataDir: await safeStatfs(activeServer?.zomboidDataPath || null),
      installDir: await safeStatfs(activeServer?.installPath || null),
    },
  };
}

export async function buildPanelConfig(activeServer) {
  let settings = {};
  let servers = [];
  let scheduledTasks = [];
  let trackedMods = [];
  try {
    settings = await getAllSettings();
  } catch (e) {
    settings = { _error: e.message };
  }
  try {
    const db = await getDb();
    servers = db?.data?.servers || [];
  } catch (e) {
    servers = [{ _error: e.message }];
  }
  try {
    scheduledTasks = await getScheduledTasks();
  } catch (e) {
    scheduledTasks = [{ _error: e.message }];
  }
  try {
    trackedMods = await getTrackedMods();
  } catch (e) {
    trackedMods = [{ _error: e.message }];
  }

  return {
    activeServerId: activeServer?.id || null,
    activeServerName: activeServer?.name || activeServer?.serverName || null,
    settings: sanitizeForBundle(settings),
    servers: sanitizeForBundle(servers),
    scheduledTasks: sanitizeForBundle(scheduledTasks),
    trackedMods: sanitizeForBundle(trackedMods),
  };
}
