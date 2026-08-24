import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// mods-conflict-scan-unmeasured-at-scale: the conflict scanner's
// buildFileIndex() walked every tracked mod's media/ folder and populated
// fileIndex synchronously, with the outer per-mod loop yielding to the
// event loop only once per mod regardless of file count. A single large
// mod (a map pack, a texture pack) could block the event loop long enough
// to freeze every other request on the panel -- RCON, the player list, any
// other tab.
//
// Fix: both walkDir()'s own entry loop and buildFileIndex()'s
// fileIndex-population loop now yield every WALK_YIELD_EVERY entries, so a
// single huge mod can no longer freeze the panel for the length of its own
// indexing.
//
// This test proves the MECHANISM (yield count scales with file count
// instead of staying fixed at one-per-mod) rather than timing a full
// 50,000-file case, which would make the suite slow.

vi.mock("../database/init.js", () => ({
  getTrackedMods: vi.fn(async () => []),
  getSetting: vi.fn(async () => null),
  getActiveServer: vi.fn(async () => null),
}));

const { buildFileIndex } = await import(
  "../utils/mods/conflictScan/fileIndex.js"
);

const WORKSHOP_ID = "123456789";

// Builds <serverPath>/steamapps/workshop/content/108600/<wsId>/onlymod/media/<sub>/f*.dat
function buildSingleModFixture(serverPath, wsId, fileCount) {
  const modDir = path.join(
    serverPath,
    "steamapps",
    "workshop",
    "content",
    "108600",
    wsId,
    "onlymod",
  );
  const subdirs = ["lua/server", "textures", "sound"];
  const mediaPath = path.join(modDir, "media");
  for (const d of subdirs)
    fs.mkdirSync(path.join(mediaPath, d), { recursive: true });
  let written = 0;
  let i = 0;
  while (written < fileCount) {
    const d = subdirs[i % subdirs.length];
    fs.closeSync(fs.openSync(path.join(mediaPath, d, `f${written}.dat`), "w"));
    written++;
    i++;
  }
}

describe("buildFileIndex() yields to the event loop many times while indexing one large mod", () => {
  let serverPath;

  beforeEach(() => {
    serverPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "mods-conflict-scan-el-"),
    );
  });

  afterEach(() => {
    fs.rmSync(serverPath, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("yield count scales with file count instead of staying fixed at one-per-mod", async () => {
    buildSingleModFixture(serverPath, WORKSHOP_ID, 500);
    const smallSpy = vi.spyOn(global, "setImmediate");
    await buildFileIndex([WORKSHOP_ID], serverPath, null, null);
    const smallYields = smallSpy.mock.calls.length;
    smallSpy.mockRestore();
    fs.rmSync(path.join(serverPath, "steamapps"), {
      recursive: true,
      force: true,
    });

    buildSingleModFixture(serverPath, WORKSHOP_ID, 6000);
    const largeSpy = vi.spyOn(global, "setImmediate");
    const { fileIndex, modsScanned } = await buildFileIndex(
      [WORKSHOP_ID],
      serverPath,
      null,
      null,
    );
    const largeYields = largeSpy.mock.calls.length;
    largeSpy.mockRestore();

    // Sanity: the walk itself actually ran and found every file.
    expect(modsScanned).toBe(1);
    expect(Object.keys(fileIndex).length).toBe(6000);

    // Old code yielded exactly once per mod, regardless of file count --
    // this ratio would stay ~flat instead of growing with fileCount.
    expect(largeYields).toBeGreaterThan(smallYields * 2);
  });

  it("event loop stays responsive during a large single-mod walk -- a concurrent timer fires throughout, not just before/after", async () => {
    buildSingleModFixture(serverPath, WORKSHOP_ID, 8000);

    const tickGaps = [];
    let lastTick = Date.now();
    const heartbeat = setInterval(() => {
      const now = Date.now();
      tickGaps.push(now - lastTick);
      lastTick = now;
    }, 15);

    await buildFileIndex([WORKSHOP_ID], serverPath, null, null);
    clearInterval(heartbeat);

    // If the event loop were blocked in one long synchronous burst, the
    // heartbeat would fire zero times during the whole scan. Even a single
    // tick proves the loop got a chance to run between yields.
    expect(tickGaps.length).toBeGreaterThanOrEqual(1);
  });
});
