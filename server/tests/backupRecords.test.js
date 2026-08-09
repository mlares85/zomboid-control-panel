import { beforeEach, describe, expect, it, vi } from "vitest";

let settingsStore;

vi.mock("../database/init.js", () => ({
  getSetting: vi.fn(async (key) => settingsStore[key] ?? null),
  setSetting: vi.fn(async (key, value) => {
    settingsStore[key] = value;
  }),
}));

const { addRecord, listRecords, getRecord, updateRecord, deleteRecord, listBackupServers } =
  await import("../services/backupRecords.js");

beforeEach(() => {
  settingsStore = {};
});

function fields(overrides = {}) {
  return {
    type: "full",
    format: "zip",
    originalSize: 1000,
    compressedSize: 400,
    compressionRatio: "60%",
    compressionTime: 50,
    checksum: "sha256:abc",
    serverName: "servertest",
    destination: "Local (default)",
    fileName: "servertest_full_2026-01-01T00-00-00.zip",
    ...overrides,
  };
}

describe("addRecord", () => {
  it("fills in id/timestamp and the documented defaults", async () => {
    const record = await addRecord(fields());
    expect(record.id).toBeTruthy();
    expect(record.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(record.verified).toBe(false);
    expect(record.remotePath).toBeNull();
    expect(record.incrementalBase).toBeNull();
    expect(record.changedFiles).toBeNull();
    expect(record.retainUntil).toBeNull();
    expect(record.sizeBytes).toBe(400);
    expect(record.serverSnapshot).toBeNull();
  });

  it("stores an explicit serverSnapshot", async () => {
    const snapshot = { serverId: "srv-1", serverName: "servertest", mods: [] };
    const record = await addRecord(fields({ serverSnapshot: snapshot }));
    expect(record.serverSnapshot).toEqual(snapshot);
  });

  it("honors an explicit id (used to keep manifest linkage consistent)", async () => {
    const record = await addRecord(fields({ id: "fixed-id" }));
    expect(record.id).toBe("fixed-id");
  });
});

describe("listRecords", () => {
  it("returns newest first", async () => {
    const a = await addRecord(fields({ id: "a" }));
    await new Promise((r) => setTimeout(r, 2));
    const b = await addRecord(fields({ id: "b" }));

    const records = await listRecords();
    expect(records.map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it("respects a limit", async () => {
    await addRecord(fields({ id: "a" }));
    await addRecord(fields({ id: "b" }));
    await addRecord(fields({ id: "c" }));
    expect(await listRecords({ limit: 2 })).toHaveLength(2);
  });

  it("filters by serverSnapshot.serverId", async () => {
    await addRecord(fields({ id: "a", serverSnapshot: { serverId: "srv-1" } }));
    await addRecord(fields({ id: "b", serverSnapshot: { serverId: "srv-2" } }));

    const records = await listRecords({ serverId: "srv-1" });
    expect(records.map((r) => r.id)).toEqual(["a"]);
  });

  it("filters by serverName for records without a serverSnapshot", async () => {
    await addRecord(fields({ id: "a", serverName: "alpha" }));
    await addRecord(fields({ id: "b", serverName: "beta" }));

    const records = await listRecords({ serverName: "beta" });
    expect(records.map((r) => r.id)).toEqual(["b"]);
  });
});

describe("listBackupServers", () => {
  it("groups records by server, counting backups and tracking the latest timestamp", async () => {
    await addRecord(fields({ id: "a", serverName: "alpha", serverSnapshot: { serverId: "srv-1" } }));
    await new Promise((r) => setTimeout(r, 2));
    const latest = await addRecord(
      fields({ id: "b", serverName: "alpha", serverSnapshot: { serverId: "srv-1" } }),
    );
    await addRecord(fields({ id: "c", serverName: "beta", serverSnapshot: { serverId: "srv-2" } }));

    const servers = await listBackupServers();
    expect(servers).toHaveLength(2);
    const alpha = servers.find((s) => s.serverId === "srv-1");
    expect(alpha).toMatchObject({ serverName: "alpha", backupCount: 2, lastBackupAt: latest.timestamp });
  });

  it("falls back to grouping by serverName for legacy records with no snapshot", async () => {
    await addRecord(fields({ id: "a", serverName: "legacy-server" }));

    const servers = await listBackupServers();
    expect(servers).toEqual([
      expect.objectContaining({ serverId: null, serverName: "legacy-server", backupCount: 1 }),
    ]);
  });
});

describe("getRecord / updateRecord / deleteRecord", () => {
  it("round-trips a lookup by id", async () => {
    const record = await addRecord(fields({ id: "target" }));
    expect(await getRecord("target")).toEqual(record);
    expect(await getRecord("missing")).toBeNull();
  });

  it("updateRecord merges fields and persists them", async () => {
    await addRecord(fields({ id: "target" }));
    const updated = await updateRecord("target", { verified: true });
    expect(updated.verified).toBe(true);
    expect(await getRecord("target")).toMatchObject({ verified: true });
  });

  it("updateRecord throws for an unknown id", async () => {
    await expect(updateRecord("missing", {})).rejects.toThrow(/not found/);
  });

  it("deleteRecord removes the record", async () => {
    await addRecord(fields({ id: "target" }));
    await deleteRecord("target");
    expect(await getRecord("target")).toBeNull();
  });
});
