import fs from "fs";
import os from "os";
import path from "path";
import {
  getBridgeLogs,
  getCommandHistory,
  getDatabaseStats,
  getDb,
  getPerformanceHistory,
  getPlayerLogs,
} from "../../../database/init.js";
import panelBridgeService from "../../../services/panelBridge.js";
import { sanitizeForBundle } from "./sanitize.js";

function sanitizeCommandHistoryEntry(entry) {
  if (!entry) return entry;
  const cloned = { ...entry };
  if (typeof cloned.command === "string") {
    // Mask anything that looks like an auth/password literal in raw RCON strings
    cloned.command = cloned.command.replace(
      /(password\s*[:=]\s*)\S+/gi,
      "$1••••",
    );
  }
  return cloned;
}

export async function buildRecentEvents() {
  let serverEvents = [];
  let commandHistory = [];
  let playerLogs = [];
  let scheduleHistory = [];
  let bridgeLogs = [];

  try {
    const db = await getDb();
    serverEvents = (db?.data?.server_events || []).slice(0, 50);
    scheduleHistory = (db?.data?.schedule_history || []).slice(0, 50);
  } catch (e) {
    serverEvents = [{ _error: e.message }];
  }
  try {
    commandHistory = (await getCommandHistory(100)).map(
      sanitizeCommandHistoryEntry,
    );
  } catch (e) {
    commandHistory = [{ _error: e.message }];
  }
  try {
    playerLogs = await getPlayerLogs(null, 100);
  } catch (e) {
    playerLogs = [{ _error: e.message }];
  }
  try {
    bridgeLogs = await getBridgeLogs(100);
  } catch (e) {
    bridgeLogs = [{ _error: e.message }];
  }

  return {
    serverEvents: sanitizeForBundle(serverEvents),
    commandHistory: sanitizeForBundle(commandHistory),
    playerLogs: sanitizeForBundle(playerLogs),
    scheduleHistory: sanitizeForBundle(scheduleHistory),
    bridgeLogs: sanitizeForBundle(bridgeLogs),
  };
}

export async function buildPerformanceHistory() {
  try {
    return await getPerformanceHistory(180); // up to 3h at 1-min samples
  } catch (e) {
    return { _error: e.message };
  }
}

export async function buildDbStats() {
  try {
    const stats = await getDatabaseStats();
    return sanitizeForBundle(stats);
  } catch (e) {
    return { _error: e.message };
  }
}

export function buildBridgeStatus() {
  try {
    const status = panelBridgeService?.getStatus?.() || null;
    if (!status) return { available: false };

    const enriched = { ...status };
    // Add mtimes of the IPC files for forensics
    if (status.bridgePath) {
      const probe = ["commands.json", "results.json", "status.json"];
      enriched.ipcFiles = {};
      for (const name of probe) {
        const fp = path.join(status.bridgePath, name);
        try {
          if (fs.existsSync(fp)) {
            const s = fs.statSync(fp);
            enriched.ipcFiles[name] = {
              exists: true,
              size: s.size,
              modified: s.mtime.toISOString(),
              ageSeconds: Math.round((Date.now() - s.mtimeMs) / 1000),
            };
          } else {
            enriched.ipcFiles[name] = { exists: false };
          }
        } catch (e) {
          enriched.ipcFiles[name] = { error: e.message };
        }
      }
    }
    return sanitizeForBundle(enriched);
  } catch (e) {
    return { _error: e.message };
  }
}

export async function buildProcessSnapshot() {
  return {
    title: process.title,
    versions: process.versions,
    features: process.features,
    resourceUsage:
      typeof process.resourceUsage === "function"
        ? process.resourceUsage()
        : null,
    activeRequests:
      typeof process._getActiveRequests === "function"
        ? process._getActiveRequests().length
        : null,
    activeHandles:
      typeof process._getActiveHandles === "function"
        ? process._getActiveHandles().length
        : null,
  };
}

export async function buildNetworkInterfaces() {
  try {
    const ifaces = os.networkInterfaces();
    // Strip MAC + scopeid so we don't ship hardware identifiers
    const sanitized = {};
    for (const [name, addrs] of Object.entries(ifaces || {})) {
      sanitized[name] = (addrs || []).map((a) => ({
        address: a.address,
        family: a.family,
        internal: a.internal,
        cidr: a.cidr,
      }));
    }
    return sanitized;
  } catch (e) {
    return { _error: e.message };
  }
}
