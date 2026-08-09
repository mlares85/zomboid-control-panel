import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  scanDirectory,
  loadManifest,
  saveManifest,
  diffAgainstManifest,
  shouldRunFull,
  sumSizes,
  recordManifestAfterBackup,
  resolveRestoreChain,
} from "../utils/backupIncremental.js";

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pz-incremental-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("scanDirectory", () => {
  it("returns relative paths with mtime and size, recursing into subdirs", async () => {
    fs.writeFileSync(path.join(root, "a.bin"), "12345");
    fs.mkdirSync(path.join(root, "players"));
    fs.writeFileSync(path.join(root, "players", "steve.bin"), "abcdefgh");

    const files = await scanDirectory(root);

    expect(Object.keys(files).sort()).toEqual(["a.bin", "players/steve.bin"]);
    expect(files["a.bin"].size).toBe(5);
    expect(files["players/steve.bin"].size).toBe(8);
    expect(typeof files["a.bin"].mtimeMs).toBe("number");
  });

  it("returns an empty map for a missing directory instead of throwing", async () => {
    const files = await scanDirectory(path.join(root, "does-not-exist"));
    expect(files).toEqual({});
  });
});

describe("manifest load/save round trip", () => {
  it("returns a blank manifest when the file doesn't exist yet", () => {
    const manifest = loadManifest(path.join(root, "backup-manifest.json"));
    expect(manifest).toEqual({ files: {}, lastFullBackupId: null, backupCount: 0 });
  });

  it("saves and reloads the manifest exactly", () => {
    const manifestPath = path.join(root, "backup-manifest.json");
    const manifest = {
      files: { "a.bin": { mtimeMs: 100, size: 5 } },
      lastFullBackupId: "full-1",
      backupCount: 2,
    };
    saveManifest(manifestPath, manifest);
    expect(loadManifest(manifestPath)).toEqual(manifest);
  });
});

describe("diffAgainstManifest", () => {
  it("flags new and modified files, and lists removed ones", () => {
    const manifest = {
      files: {
        "unchanged.bin": { mtimeMs: 100, size: 5 },
        "modified.bin": { mtimeMs: 100, size: 5 },
        "deleted.bin": { mtimeMs: 100, size: 5 },
      },
    };
    const current = {
      "unchanged.bin": { mtimeMs: 100, size: 5 },
      "modified.bin": { mtimeMs: 200, size: 5 },
      "new.bin": { mtimeMs: 300, size: 9 },
    };

    const { changed, removed } = diffAgainstManifest(current, manifest);

    expect(changed.sort()).toEqual(["modified.bin", "new.bin"]);
    expect(removed).toEqual(["deleted.bin"]);
  });
});

describe("shouldRunFull", () => {
  it("is true when no full backup has run yet", () => {
    expect(shouldRunFull({ lastFullBackupId: null, backupCount: 0 }, 7)).toBe(true);
  });

  it("is false while under the fullEveryN threshold", () => {
    expect(shouldRunFull({ lastFullBackupId: "full-1", backupCount: 3 }, 7)).toBe(false);
  });

  it("is true once the threshold is reached", () => {
    expect(shouldRunFull({ lastFullBackupId: "full-1", backupCount: 7 }, 7)).toBe(true);
  });
});

describe("sumSizes", () => {
  const files = { a: { size: 10 }, b: { size: 20 }, c: { size: 30 } };

  it("sums every file when no subset is given", () => {
    expect(sumSizes(files)).toBe(60);
  });

  it("sums only the requested subset", () => {
    expect(sumSizes(files, ["a", "c"])).toBe(40);
  });
});

describe("recordManifestAfterBackup", () => {
  it("resets the base and counter on a full backup", () => {
    const manifest = { files: {}, lastFullBackupId: "old-full", backupCount: 5 };
    const currentFiles = { "a.bin": { mtimeMs: 1, size: 1 } };

    const next = recordManifestAfterBackup(manifest, {
      backupId: "full-2",
      type: "full",
      currentFiles,
    });

    expect(next).toEqual({ files: currentFiles, lastFullBackupId: "full-2", backupCount: 0 });
  });

  it("keeps the base and advances the counter on an incremental", () => {
    const manifest = { files: {}, lastFullBackupId: "full-1", backupCount: 2 };
    const currentFiles = { "a.bin": { mtimeMs: 1, size: 1 } };

    const next = recordManifestAfterBackup(manifest, {
      backupId: "inc-3",
      type: "incremental",
      currentFiles,
    });

    expect(next).toEqual({ files: currentFiles, lastFullBackupId: "full-1", backupCount: 3 });
  });
});

describe("resolveRestoreChain", () => {
  const records = [
    { id: "full-1", type: "full", incrementalBase: null },
    { id: "inc-1", type: "incremental", incrementalBase: "full-1" },
    { id: "inc-2", type: "incremental", incrementalBase: "full-1" },
  ];

  it("returns just the full backup when targeting it directly", () => {
    expect(resolveRestoreChain(records, "full-1").map((r) => r.id)).toEqual(["full-1"]);
  });

  it("orders full + incremental oldest first when targeting an incremental", () => {
    expect(resolveRestoreChain(records, "inc-2").map((r) => r.id)).toEqual([
      "full-1",
      "inc-2",
    ]);
  });

  it("throws for an unknown target id", () => {
    expect(() => resolveRestoreChain(records, "missing")).toThrow(/not found/);
  });

  it("throws when the incremental base is missing from history", () => {
    const broken = [{ id: "inc-orphan", type: "incremental", incrementalBase: "nope" }];
    expect(() => resolveRestoreChain(broken, "inc-orphan")).toThrow(/missing/);
  });
});
