import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let settingsStore;

vi.mock("../database/init.js", () => ({
  getActiveServer: vi.fn(async () => ({ serverName: "servertest" })),
  getTrackedMods: vi.fn(async () => []),
  getSetting: vi.fn(async (key) => settingsStore[key] ?? null),
  setSetting: vi.fn(async (key, value) => {
    settingsStore[key] = value;
  }),
}));

const { createEnhancedBackup } = await import("../services/backupOrchestrator.js");
const { listRecords } = await import("../services/backupRecords.js");
const { resolveRestoreChain, loadManifest } = await import("../utils/backupIncremental.js");

let root;
let savesPath;
let backupsPath;
let backupService;

beforeEach(() => {
  settingsStore = {};
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pz-orchestrator-"));
  savesPath = path.join(root, "Saves", "Multiplayer", "servertest");
  backupsPath = path.join(root, "backups");
  fs.mkdirSync(savesPath, { recursive: true });
  fs.mkdirSync(backupsPath, { recursive: true });
  fs.writeFileSync(path.join(savesPath, "map_meta.bin"), "meta-v1");
  fs.writeFileSync(path.join(savesPath, "worldstats.txt"), "stats-v1");

  backupService = {
    getSavesPath: async () => savesPath,
    getBackupsPath: async () => backupsPath,
  };
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("createEnhancedBackup", () => {
  it("runs a full backup, verified and uploaded to the default local destination", async () => {
    const result = await createEnhancedBackup(backupService, { format: "zip" });

    expect(result.success).toBe(true);
    expect(result.backup.type).toBe("full");
    expect(result.backup.format).toBe("zip");
    expect(result.backup.verified).toBe(true);
    expect(result.backup.destination).toBe("Local (default)");
    expect(result.backup.checksum).toMatch(/^sha256:/);
    expect(result.backup.compressionRatio).toMatch(/%$/);
    expect(fs.existsSync(path.join(backupsPath, result.backup.fileName))).toBe(true);

    const manifest = loadManifest(path.join(backupsPath, "backup-manifest.json"));
    expect(manifest.lastFullBackupId).toBe(result.backup.id);
    expect(manifest.backupCount).toBe(0);
  });

  it("runs an incremental backup that only counts changed files, linked to the prior full", async () => {
    const full = await createEnhancedBackup(backupService, { format: "zip" });

    // One file changes, one is untouched, one is brand new.
    fs.writeFileSync(path.join(savesPath, "map_meta.bin"), "meta-v2-longer-content");
    fs.writeFileSync(path.join(savesPath, "players.db"), "new file");

    const incremental = await createEnhancedBackup(backupService, {
      format: "zip",
      type: "incremental",
    });

    expect(incremental.backup.type).toBe("incremental");
    expect(incremental.backup.incrementalBase).toBe(full.backup.id);
    expect(incremental.backup.changedFiles).toBe(2);

    const manifest = loadManifest(path.join(backupsPath, "backup-manifest.json"));
    expect(manifest.lastFullBackupId).toBe(full.backup.id);
    expect(manifest.backupCount).toBe(1);
  });

  it("produces a resolvable restore chain across full + incremental records", async () => {
    const full = await createEnhancedBackup(backupService, { format: "zip" });
    fs.writeFileSync(path.join(savesPath, "map_meta.bin"), "meta-v2");
    const incremental = await createEnhancedBackup(backupService, {
      format: "zip",
      type: "incremental",
    });

    const records = await listRecords();
    const chain = resolveRestoreChain(records, incremental.backup.id);

    expect(chain.map((r) => r.id)).toEqual([full.backup.id, incremental.backup.id]);
  });

  it("rejects an unavailable format before touching the filesystem", async () => {
    await expect(
      createEnhancedBackup(backupService, { format: "not-a-real-format" }),
    ).rejects.toThrow(/not available/);
  });

  it("embeds a serverSnapshot in the resulting record", async () => {
    const result = await createEnhancedBackup(backupService, { format: "zip" });

    expect(result.backup.serverSnapshot).toMatchObject({
      serverName: "servertest",
      mods: [],
      playerCount: null,
      worldAge: null,
    });
    expect(result.backup.serverSnapshot.saveSize).toBeGreaterThan(0);
  });
});
