import { describe, expect, it, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import { probeMount, discoverMounts } from "../services/mountDiscovery.js";

describe("mountDiscovery", () => {
  const tmpDirs = [];

  afterEach(() => {
    while (tmpDirs.length) {
      fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
    }
    delete process.env.PZ_SERVER_PATH;
    delete process.env.PZ_SAVE_PATH;
  });

  function makeTmpDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mount-discovery-"));
    tmpDirs.push(dir);
    return dir;
  }

  it("probeMount returns null for a directory that does not exist", () => {
    expect(probeMount(path.join(os.tmpdir(), "definitely-not-here-xyz"))).toBeNull();
  });

  it("probeMount identifies a PZ data folder by its Saves subfolder", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "Saves"));

    const result = probeMount(dir);

    expect(result).toEqual({ path: dir, type: "data", hasSavesDir: true });
  });

  it("probeMount identifies a PZ server install folder by its marker files", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "steam_appid.txt"), "108600");

    const result = probeMount(dir);

    expect(result).toEqual({ path: dir, type: "install" });
  });

  it("probeMount returns null for an ordinary folder with no PZ markers", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "readme.txt"), "nothing to see here");

    expect(probeMount(dir)).toBeNull();
  });

  it("discoverMounts picks up a server referenced by PZ_SERVER_PATH", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "steam_appid.txt"), "108600");
    process.env.PZ_SERVER_PATH = dir;

    const results = discoverMounts();

    expect(results).toContainEqual({ path: path.resolve(dir), type: "install" });
  });

  it("discoverMounts de-duplicates candidates that resolve to the same path", () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, "Multiplayer"));
    process.env.PZ_SERVER_PATH = dir;
    process.env.PZ_SAVE_PATH = dir;

    const results = discoverMounts();

    const matches = results.filter((r) => r.path === path.resolve(dir));
    expect(matches).toHaveLength(1);
  });
});
