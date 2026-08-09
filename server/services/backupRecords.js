import { randomUUID } from "crypto";
import { getSetting, setSetting } from "../database/init.js";

const SETTINGS_KEY = "backupRecordsV2";
const MAX_RECORDS = 500; // matches the retention cap other history arrays use in database/init.js

export async function listRecords(limit) {
  const stored = await getSetting(SETTINGS_KEY);
  const records = Array.isArray(stored) ? stored : [];
  const sorted = [...records].sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  return limit ? sorted.slice(0, limit) : sorted;
}

async function saveRecords(records) {
  await setSetting(SETTINGS_KEY, records.slice(0, MAX_RECORDS));
}

export async function getRecord(id) {
  const records = await listRecords();
  return records.find((r) => r.id === id) || null;
}

/**
 * Build and persist a new backup record. `fields` supplies everything the
 * caller already knows (compression metadata, destination, incremental
 * linkage); this fills in `id`/`timestamp` and the defaults documented in
 * the backup system design (verified/retainUntil start unset).
 */
export async function addRecord(fields) {
  const record = {
    id: fields.id || randomUUID(),
    timestamp: new Date().toISOString(),
    type: fields.type,
    format: fields.format,
    originalSize: fields.originalSize,
    compressedSize: fields.compressedSize,
    compressionRatio: fields.compressionRatio,
    compressionTime: fields.compressionTime,
    checksum: fields.checksum,
    verified: fields.verified ?? false,
    serverName: fields.serverName,
    destination: fields.destination,
    remotePath: fields.remotePath ?? null,
    incrementalBase: fields.incrementalBase ?? null,
    changedFiles: fields.changedFiles ?? null,
    retainUntil: fields.retainUntil ?? null,
    fileName: fields.fileName ?? null,
    sizeBytes: fields.compressedSize,
  };
  const records = await listRecords();
  records.unshift(record);
  await saveRecords(records);
  return record;
}

export async function updateRecord(id, updates) {
  const records = await listRecords();
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) throw new Error(`Backup record not found: ${id}`);
  records[index] = { ...records[index], ...updates };
  await saveRecords(records);
  return records[index];
}

export async function deleteRecord(id) {
  const records = await listRecords();
  const next = records.filter((r) => r.id !== id);
  await saveRecords(next);
}
