import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

let activeServer;
let settingsStore;

vi.mock("../database/init.js", () => ({
  getActiveServer: vi.fn(async () => activeServer),
  getTrackedMods: vi.fn(async () => []),
  getSetting: vi.fn(async (key) => settingsStore[key] ?? null),
  setSetting: vi.fn(async (key, value) => { settingsStore[key] = value; }),
}));

vi.mock("../services/panelBridge.js", () => ({
  default: { getGameTime: vi.fn(async () => null) },
}));

const { createDockerBackup } = await import("../services/dockerBackup.js");
const { listRecords } = await import("../services/backupRecords.js");

let root;
let backupsPath;
let backupService;

function fakeDockerClient({ archiveFails, containerMissing } = {}) {
  return {
    available: true,
    inspectContainer: vi.fn(async () =>
      containerMissing ? null : { Id: "c1", State: { Running: true } },
    ),
    getArchive: vi.fn(async (_id, _path, destPath) => {
      if (archiveFails) return { success: false, error: archiveFails };
      const { createGzip } = await import("zlib");
      const { pipeline } = await import("stream/promises");
      const { Readable } = await import("stream");
      const output = fs.createWriteStream(destPath);
      await pipeline(Readable.from(Buffer.from("fake-tar-content")), createGzip(), output);
      const stat = await fs.promises.stat(destPath);
      return { success: true, size: stat.size };
    }),
  };
}

beforeEach(() => {
  settingsStore = {};
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pz-docker-backup-"));
  backupsPath = path.join(root, "backups");
  fs.mkdirSync(backupsPath, { recursive: true });

  activeServer = {
    id: randomUUID(),
    serverName: "servertest",
    provider: "docker-managed",
    dockerContainerId: "abc123",
    dockerContainerName: "zomboid-servertest",
    zomboidDataPath: null,
  };

  backupService = { getBackupsPath: async () => backupsPath };
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("createDockerBackup", () => {
  it("creates a tar.gz backup from container saves via getArchive", async () => {
    const dockerClient = fakeDockerClient();
    const result = await createDockerBackup(
      { dockerClient, backupService, io: null, rconService: null },
      {},
    );

    expect(result.success).toBe(true);
    expect(result.backup.type).toBe("full");
    expect(result.backup.format).toBe("tar.gz");
    expect(result.backup.serverName).toBe("servertest");
    expect(result.backup.checksum).toMatch(/^sha256:/);
    expect(result.backup.fileName).toMatch(/^servertest_docker_.*\.tar\.gz$/);
    expect(fs.existsSync(path.join(backupsPath, result.backup.fileName))).toBe(true);

    expect(dockerClient.inspectContainer).toHaveBeenCalledWith("abc123");
    expect(dockerClient.getArchive).toHaveBeenCalledWith(
      "abc123",
      "/root/Zomboid/Saves/Multiplayer/servertest",
      expect.stringContaining("servertest_docker_"),
      { compress: true },
    );
  });

  it("includes a server snapshot in the record", async () => {
    const result = await createDockerBackup(
      { dockerClient: fakeDockerClient(), backupService, io: null, rconService: null },
      {},
    );

    expect(result.backup.serverSnapshot).toMatchObject({
      serverName: "servertest",
      provider: "docker-managed",
      mods: [],
    });
  });

  it("emits progress events when io is provided", async () => {
    const io = { emit: vi.fn() };
    await createDockerBackup(
      { dockerClient: fakeDockerClient(), backupService, io, rconService: null },
      {},
    );

    const phases = io.emit.mock.calls
      .filter(([event]) => event === "backup:progress")
      .map(([, data]) => data.phase);
    expect(phases).toContain("preparing");
    expect(phases).toContain("archiving");
    expect(phases).toContain("finalizing");
    expect(phases).toContain("complete");
  });

  it("throws when the container is missing", async () => {
    const dockerClient = fakeDockerClient({ containerMissing: true });

    await expect(
      createDockerBackup(
        { dockerClient, backupService, io: null, rconService: null },
        {},
      ),
    ).rejects.toThrow(/not found/);
  });

  it("throws when the server has no container ID", async () => {
    activeServer.dockerContainerId = null;

    await expect(
      createDockerBackup(
        { dockerClient: fakeDockerClient(), backupService, io: null, rconService: null },
        {},
      ),
    ).rejects.toThrow(/No Docker container ID/);
  });

  it("throws when getArchive fails (e.g. saves path does not exist)", async () => {
    const dockerClient = fakeDockerClient({ archiveFails: "no such file" });

    await expect(
      createDockerBackup(
        { dockerClient, backupService, io: null, rconService: null },
        {},
      ),
    ).rejects.toThrow(/no such file/);
  });

  it("persists a retrievable backup record", async () => {
    await createDockerBackup(
      { dockerClient: fakeDockerClient(), backupService, io: null, rconService: null },
      {},
    );

    const records = await listRecords();
    expect(records.length).toBe(1);
    expect(records[0].format).toBe("tar.gz");
    expect(records[0].type).toBe("full");
  });
});
