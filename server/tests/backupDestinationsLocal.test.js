import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { LocalDestination } from "../services/backupDestinations/local.js";

let root;
let dir;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pz-local-dest-"));
  dir = path.join(root, "backups");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("LocalDestination", () => {
  it("test() reports writable when the directory can be created", async () => {
    const destination = new LocalDestination({ path: dir });
    const result = await destination.test();
    expect(result.success).toBe(true);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it("uploads, lists, downloads and deletes a file", async () => {
    const destination = new LocalDestination({ path: dir });
    const sourceFile = path.join(root, "backup.zip");
    fs.writeFileSync(sourceFile, "archive contents");

    const uploadResult = await destination.upload(sourceFile, "backup.zip");
    expect(uploadResult.success).toBe(true);
    expect(fs.existsSync(path.join(dir, "backup.zip"))).toBe(true);

    const listed = await destination.list();
    expect(listed).toEqual([
      { name: "backup.zip", size: 16, modified: expect.any(String) },
    ]);

    const downloadTarget = path.join(root, "restored.zip");
    await destination.download("backup.zip", downloadTarget);
    expect(fs.readFileSync(downloadTarget, "utf8")).toBe("archive contents");

    await destination.delete("backup.zip");
    expect(fs.existsSync(path.join(dir, "backup.zip"))).toBe(false);
  });

  it("sanitizes remoteName to prevent path traversal", async () => {
    const destination = new LocalDestination({ path: dir });
    const sourceFile = path.join(root, "backup.zip");
    fs.writeFileSync(sourceFile, "x");

    await destination.upload(sourceFile, "../../etc/evil.zip");

    // basename() strips the traversal — the file lands inside dir, not above it.
    expect(fs.existsSync(path.join(dir, "evil.zip"))).toBe(true);
    expect(fs.existsSync(path.join(root, "evil.zip"))).toBe(false);
  });

  it("list() returns an empty array when the directory doesn't exist yet", async () => {
    const destination = new LocalDestination({ path: dir });
    expect(await destination.list()).toEqual([]);
  });
});
