import { randomUUID } from "crypto";
import { getSetting, setSetting } from "../database/init.js";

const SETTINGS_KEY = "backupRecordsV2";
const MAX_RECORDS = 500; // matches the retention cap other history arrays use in database/init.js

// Serialized mutation queue — prevents concurrent read-modify-write races
// when e.g. two backup jobs finish at the same time.
let mutationChain = Promise.resolve();

function mutateRecords(mutator) {
  const operation = mutationChain.then(async () => {
    const records = await readAllRecords();
    const result = await mutator(records);
    await saveRecords(records);
    return result;
  });
  // Swallow rejections on the chain so a failed mutation doesn't block
  // subsequent ones, but the returned promise still rejects for the caller.
  mutationChain = operation.then(() => undefined, () => undefined);
  return operation;
}

// Raw read without filtering/sorting — used by mutateRecords so it operates
// on the full stored array, not a filtered/truncated subset.
async function readAllRecords() {
  const stored = await getSetting(SETTINGS_KEY);
  return Array.isArray(stored) ? stored : [];
}

export async function listRecords({ limit, serverId, serverName } = {}) {
  let records = await readAllRecords();
  if (serverId) {
    records = records.filter((r) => r.serverSnapshot?.serverId === serverId);
  }
  if (serverName) {
    records = records.filter((r) => r.serverName === serverName);
  }
  const sorted = [...records].sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  return limit ? sorted.slice(0, limit) : sorted;
}

// Distinct servers referenced by stored backup records, for the History
// table's server filter dropdown. Grouped by serverId when the snapshot has
// one (post-this-feature backups), falling back to serverName for older
// records that predate serverSnapshot.
export async function listBackupServers() {
  const records = await listRecords();
  const byKey = new Map();
  for (const record of records) {
    const key = record.serverSnapshot?.serverId || record.serverName || "unknown";
    const existing = byKey.get(key);
    if (existing) {
      existing.backupCount++;
      if (record.timestamp > existing.lastBackupAt) existing.lastBackupAt = record.timestamp;
      continue;
    }
    byKey.set(key, {
      serverId: record.serverSnapshot?.serverId || null,
      serverName: record.serverName || "Unknown",
      backupCount: 1,
      lastBackupAt: record.timestamp,
    });
  }
  return Array.from(byKey.values());
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
    serverSnapshot: fields.serverSnapshot ?? null,
  };
  await mutateRecords((records) => { records.unshift(record); });
  return record;
}

export async function updateRecord(id, updates) {
  return mutateRecords((records) => {
    const index = records.findIndex((r) => r.id === id);
    if (index === -1) throw new Error(`Backup record not found: ${id}`);
    records[index] = { ...records[index], ...updates };
    return records[index];
  });
}

export async function deleteRecord(id) {
  await mutateRecords((records) => {
    const retained = records.filter((r) => r.id !== id);
    records.splice(0, records.length, ...retained);
  });
}
