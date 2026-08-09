import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { compareFormatsOnSample } from "../utils/backupFormatCompare.js";

let root;
let sourceDir;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pz-format-compare-"));
  sourceDir = path.join(root, "servertest");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "map_meta.bin"), "A".repeat(20000));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("compareFormatsOnSample", () => {
  it("returns a failure message when no save is configured", async () => {
    const result = await compareFormatsOnSample(null);
    expect(result).toEqual({ success: false, message: expect.any(String), results: [] });
  });

  it("returns a failure message for an empty save directory", async () => {
    const empty = path.join(root, "empty");
    fs.mkdirSync(empty);
    const result = await compareFormatsOnSample(empty);
    expect(result.success).toBe(false);
  });

  it("compresses a sample with every known format and cleans up after itself", async () => {
    const result = await compareFormatsOnSample(sourceDir);

    expect(result.success).toBe(true);
    expect(result.sampleSizeBytes).toBeGreaterThan(0);
    expect(result.results.map((r) => r.format)).toEqual(["zip", "tar.gz", "tar.zst"]);

    const zipResult = result.results.find((r) => r.format === "zip");
    expect(zipResult.available).toBe(true);
    expect(zipResult.compressedSize).toBeGreaterThan(0);
    expect(zipResult.ratio).toMatch(/%$/);

    // No leftover sample/output files anywhere under the OS temp dir prefix used here.
    const leftovers = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("pz-format-sample-"));
    expect(leftovers).toEqual([]);
  });
});
