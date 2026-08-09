import { beforeEach, describe, expect, it, vi } from "vitest";

let settingsStore;

vi.mock("../database/init.js", () => ({
  getSetting: vi.fn(async (key) => settingsStore[key] ?? null),
  setSetting: vi.fn(async (key, value) => {
    settingsStore[key] = value;
  }),
}));

const registry = await import("../services/backupDestinations/index.js");

beforeEach(() => {
  settingsStore = {};
});

describe("destination CRUD", () => {
  it("starts empty and creates a record with a generated id", async () => {
    expect(await registry.listDestinationRecords()).toEqual([]);

    const record = await registry.addDestinationRecord({
      type: "sftp",
      name: "  Backup Host  ",
      path: "/mnt/backups",
      config: { host: "h", username: "u", password: "p" },
    });

    expect(record.id).toBeTruthy();
    expect(record.name).toBe("Backup Host");
    expect(record.enabled).toBe(true);
    expect(await registry.listDestinationRecords()).toHaveLength(1);
  });

  it("rejects an unknown destination type", async () => {
    await expect(
      registry.addDestinationRecord({ type: "carrier-pigeon", name: "x", config: {} }),
    ).rejects.toThrow(/Unknown destination type/);
  });

  it("updates a record, merging config rather than replacing it", async () => {
    const record = await registry.addDestinationRecord({
      type: "sftp",
      name: "Host",
      config: { host: "h", username: "u", password: "old" },
    });

    const updated = await registry.updateDestinationRecord(record.id, {
      enabled: false,
      config: { password: "new" },
    });

    expect(updated.enabled).toBe(false);
    expect(updated.config).toEqual({ host: "h", username: "u", password: "new" });
  });

  it("throws when updating a destination that doesn't exist", async () => {
    await expect(registry.updateDestinationRecord("missing", {})).rejects.toThrow(/not found/);
  });

  it("deletes a record", async () => {
    const record = await registry.addDestinationRecord({ type: "local", name: "x", config: {} });
    await registry.deleteDestinationRecord(record.id);
    expect(await registry.listDestinationRecords()).toEqual([]);
  });

  it("throws when deleting a destination that doesn't exist", async () => {
    await expect(registry.deleteDestinationRecord("missing")).rejects.toThrow(/not found/);
  });
});

describe("listDestinations", () => {
  it("always prepends the implicit local destination", async () => {
    const destinations = await registry.listDestinations({ defaultLocalPath: "/data/backups" });
    expect(destinations).toHaveLength(1);
    expect(destinations[0]).toMatchObject({ id: "local", type: "local", path: "/data/backups" });
  });

  it("redacts secret fields but leaves non-secret config intact", async () => {
    await registry.addDestinationRecord({
      type: "sftp",
      name: "Host",
      config: { host: "h", username: "u", password: "supersecret" },
    });

    const destinations = await registry.listDestinations({});
    const sftpEntry = destinations.find((d) => d.type === "sftp");

    expect(sftpEntry.config.password).toBe("••••••••");
    expect(sftpEntry.config.host).toBe("h");
  });

  it("marks stub types as not implemented", async () => {
    await registry.addDestinationRecord({ type: "smb", name: "Share", config: {} });
    const destinations = await registry.listDestinations({});
    const smbEntry = destinations.find((d) => d.type === "smb");
    expect(smbEntry.implemented).toBe(false);

    const localEntry = destinations.find((d) => d.type === "local");
    expect(localEntry.implemented).toBe(true);
  });
});

describe("getDestinationInstanceById / testDestinationById", () => {
  it("resolves the implicit local destination", async () => {
    const { instance, record } = await registry.getDestinationInstanceById("local", {
      defaultLocalPath: "/data/backups",
    });
    expect(record.type).toBe("local");
    expect(instance).toBeInstanceOf(registry.LocalDestination);
  });

  it("throws for an unimplemented stub destination", async () => {
    const stub = await registry.addDestinationRecord({ type: "ftp", name: "x", config: {} });
    await expect(registry.getDestinationInstanceById(stub.id)).rejects.toThrow(/not implemented/);
  });

  it("testDestinationById never throws, even for a broken/unknown id", async () => {
    const result = await registry.testDestinationById("does-not-exist");
    expect(result).toEqual({ success: false, message: expect.any(String) });
  });

  it("testDestinationById surfaces the stub's graceful message", async () => {
    const stub = await registry.addDestinationRecord({ type: "rsync", name: "x", config: {} });
    const result = await registry.testDestinationById(stub.id);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not implemented/);
  });
});
