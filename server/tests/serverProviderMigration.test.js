import { describe, it, expect } from "vitest";
import os from "os";

// normalizeServerMemory is pure (fs.existsSync + provider auto-detection) —
// safe to import the real database module instead of mocking it (same
// pattern already used for its minMemory/maxMemory normalization).
const { normalizeServerMemory } = await import("../database/init.js");

describe("normalizeServerMemory provider migration", () => {
  it("assigns a provider to a legacy server that has none stored (migration)", () => {
    const result = normalizeServerMemory({
      installPath: os.tmpdir(),
      zomboidDataPath: null,
      isRemote: false,
    });

    expect(result.provider).toBeDefined();
    expect(typeof result.provider).toBe("string");
  });

  it("auto-detects remote-sftp from isRemote when no paths are configured at all", () => {
    const result = normalizeServerMemory({
      installPath: "",
      zomboidDataPath: null,
      isRemote: true,
    });

    expect(result.provider).toBe("remote-sftp");
    expect(result.isRemote).toBe(true);
  });

  it("auto-detects remote-sftp when configured paths don't exist locally, regardless of the stale isRemote flag", () => {
    const result = normalizeServerMemory({
      installPath: "/definitely/not/a/real/path/pz-cp-test",
      zomboidDataPath: null,
      isRemote: false,
    });

    expect(result.provider).toBe("remote-sftp");
    expect(result.isRemote).toBe(true);
  });

  it("auto-detects a local provider when the resolved path exists on this host", () => {
    const result = normalizeServerMemory({
      installPath: os.tmpdir(),
      zomboidDataPath: null,
      isRemote: true, // stale/incorrect flag — paths existing locally should win
    });

    expect(["native", "docker-local"]).toContain(result.provider);
    expect(result.isRemote).toBe(false);
  });

  it("respects an explicitly stored valid provider over auto-detection", () => {
    const result = normalizeServerMemory({
      installPath: "/definitely/not/a/real/path/pz-cp-test",
      zomboidDataPath: null,
      isRemote: false,
      provider: "docker-local",
    });

    expect(result.provider).toBe("docker-local");
    // isRemote is derived from provider, not the stale stored flag
    expect(result.isRemote).toBe(false);
  });

  it("falls back to auto-detection when a stored provider value is invalid/unknown", () => {
    const result = normalizeServerMemory({
      installPath: "",
      zomboidDataPath: null,
      isRemote: true,
      provider: "totally-bogus",
    });

    expect(result.provider).toBe("remote-sftp");
  });

  it("derives isRemote consistently with isRemoteProvider for every provider value", async () => {
    const { isRemoteProvider } = await import("../utils/serverProvider.js");
    for (const provider of ["native", "docker-local", "docker-managed", "remote-sftp"]) {
      const result = normalizeServerMemory({
        installPath: os.tmpdir(),
        zomboidDataPath: null,
        provider,
      });
      expect(result.isRemote).toBe(isRemoteProvider({ provider }));
    }
  });

  it("returns null/undefined unchanged", () => {
    expect(normalizeServerMemory(null)).toBeNull();
    expect(normalizeServerMemory(undefined)).toBeUndefined();
  });
});
