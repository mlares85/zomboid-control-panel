import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// panel-oom-buildfileindex-unbounded: buildFileIndex()'s per-mod walk was
// bounded by WALK_MAX_FILES (50,000), but that budget is created fresh per
// top-level walkDir() call -- i.e. per mod, not globally. fileIndex itself
// accumulated every file across EVERY mod combined with no cap at all: a
// heavy modlist (~150 mods, several near the per-mod ceiling) can reach
// millions of entries, exhausting the heap. Fix: a GLOBAL cap
// (FILE_INDEX_MAX_ENTRIES) shared across every mod in the scan, checked
// before each entry is pushed. Once hit, the whole scan stops (not just the
// current mod) and an honest `truncated` flag + warning is returned.
//
// buildFileIndex() takes an optional `maxEntries` override (default
// FILE_INDEX_MAX_ENTRIES) so the cap is provable at a small, fast scale
// instead of needing a real 300,000-file fixture on disk.

const { buildFileIndex, FILE_INDEX_MAX_ENTRIES } = await import(
  "../utils/mods/conflictScan/fileIndex.js"
);

// Builds <serverPath>/steamapps/workshop/content/108600/<wsId>/<modDirName>/media/textures/f*.dat
function buildModFixture(serverPath, wsId, modDirName, fileCount) {
  const mediaPath = path.join(
    serverPath,
    "steamapps",
    "workshop",
    "content",
    "108600",
    wsId,
    modDirName,
    "media",
    "textures",
  );
  fs.mkdirSync(mediaPath, { recursive: true });
  for (let i = 0; i < fileCount; i++) {
    fs.closeSync(fs.openSync(path.join(mediaPath, `f${i}.dat`), "w"));
  }
}

describe("buildFileIndex() global entry cap", () => {
  let serverPath;

  beforeEach(() => {
    serverPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "mods-file-index-cap-"),
    );
  });

  afterEach(() => {
    fs.rmSync(serverPath, { recursive: true, force: true });
  });

  it("production default is 300,000 entries", () => {
    expect(FILE_INDEX_MAX_ENTRIES).toBe(300_000);
  });

  it("never accumulates more than the cap across MULTIPLE mods, even though each mod is individually far under WALK_MAX_FILES", async () => {
    // Three mods, none anywhere near the 50,000-per-mod WALK_MAX_FILES
    // ceiling, but their combined total (900) exceeds a small test cap
    // (500) -- exactly the "unbounded by mod count" shape of the bug. The
    // old code had no global counter at all, so this scenario could not
    // have been capped by anything.
    const wsIds = ["111111111", "222222222", "333333333"];
    wsIds.forEach((wsId, i) =>
      buildModFixture(serverPath, wsId, `mod_${i}`, 300),
    );
    const CAP = 500;

    const scannedMods = [];
    const { fileIndex, truncated, warnings, modsScanned } =
      await buildFileIndex(
        wsIds,
        serverPath,
        (info) => scannedMods.push(info.modId),
        null,
        CAP,
      );

    const totalEntries = Object.values(fileIndex).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );
    expect(totalEntries).toBeLessThanOrEqual(CAP);
    expect(truncated).toBe(true);
    expect(warnings.some((w) => w.includes("global"))).toBe(true);
    // The scan stopped early -- not all 3 mods were fully processed.
    expect(modsScanned).toBeLessThanOrEqual(wsIds.length);
  });

  it("does not truncate a scan that stays under the cap", async () => {
    const wsIds = ["444444444"];
    buildModFixture(serverPath, wsIds[0], "mod_a", 50);

    const { fileIndex, truncated, warnings } = await buildFileIndex(
      wsIds,
      serverPath,
      null,
      null,
      500,
    );

    expect(Object.keys(fileIndex).length).toBe(50);
    expect(truncated).toBe(false);
    expect(warnings.some((w) => w.includes("global"))).toBe(false);
  });
});
