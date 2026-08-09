import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  scanSaveChunks,
  previewCompaction,
  compactSave,
  formatBytes,
} from "../utils/saveCompaction.js";

let root;
let savePath;
let backupsPath;

const DAY = 24 * 60 * 60 * 1000;

function touch(filePath, ageMs) {
  const time = new Date(Date.now() - ageMs);
  fs.utimesSync(filePath, time, time);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pz-compaction-"));
  savePath = path.join(root, "Saves", "Multiplayer", "servertest");
  backupsPath = path.join(root, "backups");
  fs.mkdirSync(backupsPath, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeB42Chunk(x, y, sizeBytes, ageMs) {
  const dir = path.join(savePath, "map", String(x));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${y}.bin`);
  fs.writeFileSync(filePath, "x".repeat(sizeBytes));
  touch(filePath, ageMs);
}

describe("scanSaveChunks", () => {
  it("returns [] when the save (or its map/ dir) doesn't exist", async () => {
    expect(await scanSaveChunks(savePath)).toEqual([]);
  });

  it("scans the B42 map/{X}/{Y}.bin layout", async () => {
    writeB42Chunk(5, 10, 100, 0);
    writeB42Chunk(5, 11, 200, 0);
    writeB42Chunk(6, 0, 50, 0);

    const chunks = await scanSaveChunks(savePath);
    expect(chunks).toHaveLength(3);
    const byFile = Object.fromEntries(chunks.map((c) => [c.file, c]));
    expect(byFile["5/10.bin"]).toMatchObject({ x: 5, y: 10, size: 100 });
    expect(byFile["6/0.bin"]).toMatchObject({ x: 6, y: 0, size: 50 });
  });

  it("scans the legacy flat map_X_Y.bin layout", async () => {
    fs.mkdirSync(path.join(savePath, "map"), { recursive: true });
    const filePath = path.join(savePath, "map", "map_3_7.bin");
    fs.writeFileSync(filePath, "z".repeat(42));

    const chunks = await scanSaveChunks(savePath);
    expect(chunks).toEqual([
      expect.objectContaining({ file: "map_3_7.bin", x: 3, y: 7, size: 42 }),
    ]);
  });
});

describe("previewCompaction", () => {
  it("throws when the save doesn't exist", async () => {
    await expect(previewCompaction(path.join(root, "nope"))).rejects.toThrow(/not found/);
  });

  it("separates stale chunks from fresh ones by mtime", async () => {
    writeB42Chunk(1, 1, 1000, 40 * DAY); // stale
    writeB42Chunk(1, 2, 500, 1 * DAY); // fresh

    const preview = await previewCompaction(savePath, 30);

    expect(preview.totalChunkCount).toBe(2);
    expect(preview.staleChunkCount).toBe(1);
    expect(preview.totalSize).toBe(1500);
    expect(preview.staleSize).toBe(1000);
    expect(preview.estimatedSavingsPercent).toBe(67);
  });

  it("reports zero stale chunks when nothing is old enough", async () => {
    writeB42Chunk(1, 1, 1000, 1 * DAY);
    const preview = await previewCompaction(savePath, 30);
    expect(preview.staleChunkCount).toBe(0);
    expect(preview.estimatedSavingsPercent).toBe(0);
  });
});

describe("compactSave", () => {
  it("backs up and deletes stale chunks, leaving fresh ones untouched", async () => {
    writeB42Chunk(1, 1, 1000, 40 * DAY); // stale
    writeB42Chunk(1, 2, 500, 1 * DAY); // fresh

    const result = await compactSave({ savePath, backupsPath, staleDays: 30 });

    expect(result.success).toBe(true);
    expect(result.deleted).toBe(1);
    expect(result.spaceFreed).toBe(1000);
    expect(result.backupCreated).toBe(true);

    expect(fs.existsSync(path.join(savePath, "map", "1", "1.bin"))).toBe(false);
    expect(fs.existsSync(path.join(savePath, "map", "1", "2.bin"))).toBe(true);

    const backupDirs = fs.readdirSync(backupsPath).filter((n) => n.startsWith("chunks-precompact-"));
    expect(backupDirs).toHaveLength(1);
    expect(fs.readdirSync(path.join(backupsPath, backupDirs[0]))).toEqual(["1_1.bin"]);
  });

  it("is a no-op (no backup dir created) when nothing is stale", async () => {
    writeB42Chunk(1, 1, 1000, 1 * DAY);
    const result = await compactSave({ savePath, backupsPath, staleDays: 30 });

    expect(result.deleted).toBe(0);
    expect(result.backupCreated).toBe(false);
    expect(fs.readdirSync(backupsPath)).toEqual([]);
  });

  it("skips the backup step when createBackup is false", async () => {
    writeB42Chunk(1, 1, 1000, 40 * DAY);
    const result = await compactSave({ savePath, backupsPath, staleDays: 30, createBackup: false });

    expect(result.deleted).toBe(1);
    expect(result.backupCreated).toBe(false);
    expect(fs.readdirSync(backupsPath)).toEqual([]);
  });
});

describe("formatBytes", () => {
  it("scales through the expected units", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.00 GB");
  });
});
