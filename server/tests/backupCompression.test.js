import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  compressToFormat,
  computeChecksum,
  buildCompressionMetadata,
  verifyArchive,
  listFormats,
  isFormatAvailable,
} from "../utils/backupCompression.js";
import { isZstdAvailable } from "../utils/tarArchive.js";

let root;
let sourceDir;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pz-compress-"));
  sourceDir = path.join(root, "servertest");
  fs.mkdirSync(sourceDir, { recursive: true });
  // Highly compressible content so ratio assertions are meaningful.
  fs.writeFileSync(path.join(sourceDir, "map_meta.bin"), "A".repeat(50000));
  fs.mkdirSync(path.join(sourceDir, "players"), { recursive: true });
  fs.writeFileSync(
    path.join(sourceDir, "players", "steve.bin"),
    "B".repeat(20000),
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("listFormats / isFormatAvailable", () => {
  it("always reports zip and tar.gz as available", () => {
    expect(isFormatAvailable("zip")).toBe(true);
    expect(isFormatAvailable("tar.gz")).toBe(true);
  });

  it("lists all three formats with an available flag", () => {
    const formats = listFormats();
    const ids = formats.map((f) => f.id);
    expect(ids).toEqual(["zip", "tar.gz", "tar.zst"]);
    for (const f of formats) {
      expect(typeof f.available).toBe("boolean");
    }
  });
});

describe("compressToFormat: zip", () => {
  it("produces a smaller archive than the source and verifies readable", async () => {
    const destPath = path.join(root, "out.zip");
    const { compressedSize, compressionTime } = await compressToFormat({
      sourceDir,
      destPath,
      format: "zip",
      prefix: "servertest",
    });

    expect(fs.existsSync(destPath)).toBe(true);
    expect(compressedSize).toBeGreaterThan(0);
    expect(compressedSize).toBeLessThan(70000);
    expect(compressionTime).toBeGreaterThanOrEqual(0);

    const verify = await verifyArchive("zip", destPath);
    expect(verify.readable).toBe(true);
    expect(verify.entryCount).toBeGreaterThan(0);
  });

  it("supports a partial fileList for incremental backups", async () => {
    const destPath = path.join(root, "partial.zip");
    await compressToFormat({
      sourceDir,
      destPath,
      format: "zip",
      fileList: ["map_meta.bin"],
      prefix: "servertest",
    });

    const verify = await verifyArchive("zip", destPath);
    expect(verify.readable).toBe(true);
    expect(verify.entryCount).toBe(1);
  });
});

describe("compressToFormat: tar.gz", () => {
  it("produces a readable gzip archive", async () => {
    const destPath = path.join(root, "out.tar.gz");
    const { compressedSize } = await compressToFormat({
      sourceDir,
      destPath,
      format: "tar.gz",
      prefix: "servertest",
    });

    expect(fs.existsSync(destPath)).toBe(true);
    expect(compressedSize).toBeGreaterThan(0);

    const verify = await verifyArchive("tar.gz", destPath);
    expect(verify.readable).toBe(true);
    expect(verify.entryCount).toBeGreaterThan(0);
  });
});

describe.skipIf(!isZstdAvailable())("compressToFormat: tar.zst", () => {
  it("produces a readable zstd archive and cleans up the intermediate .tar", async () => {
    const destPath = path.join(root, "out.tar.zst");
    const { compressedSize } = await compressToFormat({
      sourceDir,
      destPath,
      format: "tar.zst",
      prefix: "servertest",
    });

    expect(fs.existsSync(destPath)).toBe(true);
    expect(fs.existsSync(`${destPath}.tmp.tar`)).toBe(false);
    expect(compressedSize).toBeGreaterThan(0);

    const verify = await verifyArchive("tar.zst", destPath);
    expect(verify.readable).toBe(true);
  });
});

describe("computeChecksum", () => {
  it("is deterministic for identical content", async () => {
    const fileA = path.join(root, "a.txt");
    const fileB = path.join(root, "b.txt");
    fs.writeFileSync(fileA, "same content");
    fs.writeFileSync(fileB, "same content");

    const checksumA = await computeChecksum(fileA);
    const checksumB = await computeChecksum(fileB);

    expect(checksumA).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(checksumA).toBe(checksumB);
  });

  it("differs for different content", async () => {
    const fileA = path.join(root, "a.txt");
    const fileB = path.join(root, "b.txt");
    fs.writeFileSync(fileA, "content one");
    fs.writeFileSync(fileB, "content two");

    expect(await computeChecksum(fileA)).not.toBe(await computeChecksum(fileB));
  });
});

describe("buildCompressionMetadata", () => {
  it("computes a percentage ratio and assembles the record shape", () => {
    const metadata = buildCompressionMetadata({
      format: "tar.gz",
      originalSize: 500,
      compressedSize: 120,
      compressionTime: 45,
      checksum: "sha256:abc",
    });

    expect(metadata).toEqual({
      format: "tar.gz",
      originalSize: 500,
      compressedSize: 120,
      compressionRatio: "76%",
      compressionTime: 45,
      checksum: "sha256:abc",
    });
  });

  it("floors ratio at 0% when compression expanded the data", () => {
    const metadata = buildCompressionMetadata({
      format: "zip",
      originalSize: 100,
      compressedSize: 150,
      compressionTime: 1,
      checksum: "sha256:xyz",
    });
    expect(metadata.compressionRatio).toBe("0%");
  });
});

describe("verifyArchive", () => {
  it("reports unreadable for a corrupt zip", async () => {
    const badPath = path.join(root, "corrupt.zip");
    fs.writeFileSync(badPath, "not a real zip");
    const result = await verifyArchive("zip", badPath);
    expect(result.readable).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
