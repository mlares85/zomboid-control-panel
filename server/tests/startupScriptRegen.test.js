import { describe, it, expect, vi, beforeEach } from "vitest";

// Keep buildClasspathEntries() off the real filesystem — it only needs
// `exists`/`readdir` to resolve so generateStartupScripts() can produce
// script content; the fallback classpath kicks in when exists() is false.
vi.mock("../services/fileAccess/index.js", () => ({
  LocalFiles: class {
    exists() {
      return Promise.resolve(false);
    }
    readdir() {
      return Promise.resolve([]);
    }
  },
}));

const writeFileAtomic = vi.fn();
vi.mock("../utils/fileWriteQueue.js", () => ({
  writeFileAtomic: (...args) => writeFileAtomic(...args),
}));

const { regenerateStartupScriptsForServer } = await import(
  "../routes/server/startupScripts.js"
);

function makeServer(overrides = {}) {
  return {
    installPath: "/data/pz-server",
    serverName: "MyServer",
    minMemory: 4,
    maxMemory: 8,
    zomboidDataPath: "/data/zomboid",
    adminPassword: "secret",
    serverPort: 16261,
    useNoSteam: false,
    useDebug: false,
    ...overrides,
  };
}

describe("regenerateStartupScriptsForServer", () => {
  beforeEach(() => {
    writeFileAtomic.mockClear();
  });

  it("writes a freshly-generated launch script for a normal server", async () => {
    const result = await regenerateStartupScriptsForServer(makeServer());

    expect(result).toEqual({ success: true });
    expect(writeFileAtomic).toHaveBeenCalledTimes(1);
    const [writtenPath] = writeFileAtomic.mock.calls[0];
    expect(writtenPath).toContain("MyServer");
  });

  it("skips servers with a custom startCommand — nothing generated applies to them", async () => {
    const result = await regenerateStartupScriptsForServer(
      makeServer({ startCommand: "./custom-launch.sh" }),
    );

    expect(result).toEqual({ success: true, skipped: true });
    expect(writeFileAtomic).not.toHaveBeenCalled();
  });

  it("skips servers with no installPath", async () => {
    const result = await regenerateStartupScriptsForServer(
      makeServer({ installPath: "" }),
    );

    expect(result).toEqual({ success: true, skipped: true });
    expect(writeFileAtomic).not.toHaveBeenCalled();
  });

  it("skips when no server is given", async () => {
    const result = await regenerateStartupScriptsForServer(null);

    expect(result).toEqual({ success: true, skipped: true });
    expect(writeFileAtomic).not.toHaveBeenCalled();
  });

  it("returns {success: false} instead of throwing when writing fails", async () => {
    writeFileAtomic.mockImplementationOnce(() => {
      throw new Error("disk full");
    });

    const result = await regenerateStartupScriptsForServer(makeServer());

    expect(result).toEqual({ success: false, error: "disk full" });
  });
});
