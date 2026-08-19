import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MapVersionChecker } from "../services/mapVersionChecker.js";

// Fake io that collects emitted events
function fakeIo() {
  const events = [];
  return {
    emit(event, data) {
      events.push({ event, data });
    },
    events,
  };
}

// Fake resolvers
function fakeResolveLatest(directory = "42.20.0") {
  return async () => ({
    directory,
    tileSize: 2048,
    width: 2318656,
    height: 1019040,
    maxLevel: 22,
  });
}

function fakeGetVersions(versions = []) {
  return async () => versions;
}

describe("MapVersionChecker", () => {
  let checker;
  let io;

  beforeEach(() => {
    vi.useFakeTimers();
    io = fakeIo();
  });

  afterEach(() => {
    if (checker) checker.stop();
    vi.useRealTimers();
  });

  it("checkNow sets currentVersion on first call", async () => {
    checker = new MapVersionChecker(io, {
      resolveLatest: fakeResolveLatest("42.20.0"),
      getVersions: fakeGetVersions([{ directory: "42.20.0", label: "42.20.0", isDefault: true }]),
    });

    const result = await checker.checkNow();
    expect(result.version).toBe("42.20.0");
    expect(checker.currentVersion).toBe("42.20.0");
    // First call should NOT emit version-changed
    expect(io.events).toHaveLength(0);
  });

  it("emits map:version-changed when version changes", async () => {
    let version = "42.19.0";
    const resolveLatest = async () => ({ directory: version, tileSize: 1024, width: 1157312, height: 509520, maxLevel: 21 });
    const versions = [
      { directory: "42.20.0", label: "42.20.0", isDefault: true },
      { directory: "42.19.0", label: "42.19.0", isDefault: false },
    ];

    checker = new MapVersionChecker(io, {
      resolveLatest,
      getVersions: async () => versions,
    });

    // First check seeds currentVersion
    await checker.checkNow();
    expect(checker.currentVersion).toBe("42.19.0");
    expect(io.events).toHaveLength(0);

    // Change the version
    version = "42.20.0";
    await checker.checkNow();
    expect(checker.currentVersion).toBe("42.20.0");
    expect(io.events).toHaveLength(1);
    expect(io.events[0].event).toBe("map:version-changed");
    expect(io.events[0].data.previous).toBe("42.19.0");
    expect(io.events[0].data.current).toBe("42.20.0");
  });

  it("does not emit when version stays the same", async () => {
    checker = new MapVersionChecker(io, {
      resolveLatest: fakeResolveLatest("42.20.0"),
      getVersions: fakeGetVersions(),
    });

    await checker.checkNow();
    await checker.checkNow();
    await checker.checkNow();
    expect(io.events).toHaveLength(0);
  });

  it("getStatus returns current state", async () => {
    checker = new MapVersionChecker(io, {
      resolveLatest: fakeResolveLatest("42.20.0"),
      getVersions: fakeGetVersions([{ directory: "42.20.0" }]),
    });

    await checker.checkNow();
    const status = checker.getStatus();
    expect(status.currentVersion).toBe("42.20.0");
    expect(status.intervalMs).toBe(24 * 60 * 60 * 1000);
    expect(status.lastCheckAt).toBeTypeOf("number");
    expect(status.availableVersions).toHaveLength(1);
  });

  it("setInterval clamps to valid range", async () => {
    // Mock getSetting/setSetting at the module level
    checker = new MapVersionChecker(io, {
      resolveLatest: fakeResolveLatest(),
      getVersions: fakeGetVersions(),
    });

    // Too low — clamps to 1 hour
    const low = await checker.setInterval(1000);
    expect(low).toBe(60 * 60 * 1000);

    // Too high — clamps to 7 days
    const high = await checker.setInterval(999 * 24 * 60 * 60 * 1000);
    expect(high).toBe(7 * 24 * 60 * 60 * 1000);

    // Valid — 12 hours
    const valid = await checker.setInterval(12 * 60 * 60 * 1000);
    expect(valid).toBe(12 * 60 * 60 * 1000);
  });

  it("handles resolver failure gracefully", async () => {
    checker = new MapVersionChecker(io, {
      resolveLatest: async () => { throw new Error("network error"); },
      getVersions: fakeGetVersions(),
    });

    const result = await checker.checkNow();
    expect(result.error).toBe("network error");
    expect(result.version).toBeNull();
    expect(io.events).toHaveLength(0);
  });

  it("stop clears the timer", async () => {
    checker = new MapVersionChecker(io, {
      resolveLatest: fakeResolveLatest(),
      getVersions: fakeGetVersions(),
    });

    // Manually start timer
    checker._startTimer();
    expect(checker.timer).not.toBeNull();

    checker.stop();
    expect(checker.timer).toBeNull();
  });
});
