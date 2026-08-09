import { randomUUID } from "crypto";
import { getSetting, setSetting } from "../../database/init.js";
import { BackupDestination } from "./base.js";
import { LocalDestination } from "./local.js";
import { SftpDestination } from "./sftp.js";
import { GoogleDriveDestination } from "./googleDriveDestination.js";
import { SmbDestination, FtpDestination, RsyncDestination } from "./stubs.js";

export { BackupDestination, LocalDestination, SftpDestination, GoogleDriveDestination };

const SETTINGS_KEY = "backupDestinations";
export const LOCAL_DEFAULT_ID = "local";

const DESTINATION_CLASSES = {
  local: LocalDestination,
  sftp: SftpDestination,
  "google-drive": GoogleDriveDestination,
  smb: SmbDestination,
  ftp: FtpDestination,
  rsync: RsyncDestination,
};

const IMPLEMENTED_TYPES = new Set(["local", "sftp", "google-drive"]);

export function isDestinationTypeKnown(type) {
  return Object.prototype.hasOwnProperty.call(DESTINATION_CLASSES, type);
}

export function isDestinationImplemented(type) {
  return IMPLEMENTED_TYPES.has(type);
}

export function createDestinationInstance(record) {
  const DestinationClass = DESTINATION_CLASSES[record.type];
  if (!DestinationClass) throw new Error(`Unknown destination type: ${record.type}`);
  return new DestinationClass(record.config || {});
}

// ── Persistence (stored destinations only — "local" is always implicit) ──
export async function listDestinationRecords() {
  const stored = await getSetting(SETTINGS_KEY);
  return Array.isArray(stored) ? stored : [];
}

async function saveDestinationRecords(records) {
  await setSetting(SETTINGS_KEY, records);
}

export async function addDestinationRecord({ type, name, path: destPath, config }) {
  if (!isDestinationTypeKnown(type)) throw new Error(`Unknown destination type: ${type}`);
  if (!name || typeof name !== "string" || !name.trim()) {
    throw new Error("Destination name is required");
  }
  const records = await listDestinationRecords();
  const record = {
    id: randomUUID(),
    type,
    name: name.trim().slice(0, 100),
    path: typeof destPath === "string" ? destPath.slice(0, 500) : "",
    enabled: true,
    createdAt: new Date().toISOString(),
    config: config && typeof config === "object" ? config : {},
  };
  records.push(record);
  await saveDestinationRecords(records);
  return record;
}

export async function getDestinationRecord(id) {
  const records = await listDestinationRecords();
  return records.find((r) => r.id === id) || null;
}

export async function updateDestinationRecord(id, updates = {}) {
  const records = await listDestinationRecords();
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) throw new Error("Destination not found");
  const current = records[index];
  const next = {
    ...current,
    name: updates.name !== undefined ? String(updates.name).trim().slice(0, 100) : current.name,
    path: updates.path !== undefined ? String(updates.path).slice(0, 500) : current.path,
    enabled: updates.enabled !== undefined ? !!updates.enabled : current.enabled,
    config:
      updates.config !== undefined
        ? { ...current.config, ...updates.config }
        : current.config,
  };
  records[index] = next;
  await saveDestinationRecords(records);
  return next;
}

export async function deleteDestinationRecord(id) {
  const records = await listDestinationRecords();
  const next = records.filter((r) => r.id !== id);
  if (next.length === records.length) throw new Error("Destination not found");
  await saveDestinationRecords(next);
}

// ── Client-facing view: never leak credentials back to the browser ──────
const SECRET_FIELDS = ["password", "clientSecret", "refreshToken", "accessToken"];

export function redactDestination(record) {
  const config = { ...record.config };
  for (const field of SECRET_FIELDS) {
    if (config[field]) config[field] = "••••••••";
  }
  return { ...record, config, implemented: isDestinationImplemented(record.type) };
}

function localSyntheticRecord(defaultLocalPath) {
  return {
    id: LOCAL_DEFAULT_ID,
    type: "local",
    name: "Local (default)",
    path: defaultLocalPath || "",
    enabled: true,
    createdAt: null,
    config: { path: defaultLocalPath || "" },
  };
}

export async function listDestinations({ defaultLocalPath } = {}) {
  const records = await listDestinationRecords();
  return [localSyntheticRecord(defaultLocalPath), ...records].map(redactDestination);
}

/**
 * Resolve a destination id (including the implicit "local") to a usable
 * `{ instance, record }` pair. Throws for unknown/unimplemented ids —
 * callers (route handlers, the orchestrator) decide how to surface that.
 */
export async function getDestinationInstanceById(id, { defaultLocalPath } = {}) {
  if (id === LOCAL_DEFAULT_ID) {
    const record = localSyntheticRecord(defaultLocalPath);
    return { instance: createDestinationInstance(record), record };
  }
  const record = await getDestinationRecord(id);
  if (!record) throw new Error(`Destination not found: ${id}`);
  if (!isDestinationImplemented(record.type)) {
    throw new Error(`${record.type} destinations are not implemented yet`);
  }
  return { instance: createDestinationInstance(record), record };
}

export async function testDestinationById(id, { defaultLocalPath } = {}) {
  try {
    const { instance } = await getDestinationInstanceById(id, { defaultLocalPath });
    return await instance.test();
  } catch (error) {
    return { success: false, message: error.message };
  }
}
