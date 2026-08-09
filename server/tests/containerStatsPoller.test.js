import { beforeEach, describe, expect, it, vi } from "vitest";

const getActiveServer = vi.fn();
vi.mock("../database/init.js", () => ({ getActiveServer }));

const { ContainerStatsPoller, resolveActiveContainerRef } = await import(
  "../services/containerStatsPoller.js"
);

beforeEach(() => {
  getActiveServer.mockReset();
});

describe("resolveActiveContainerRef", () => {
  it("returns null when there is no active server", async () => {
    getActiveServer.mockResolvedValue(null);
    expect(await resolveActiveContainerRef()).toBeNull();
  });

  it("prefers dockerContainerId over dockerContainerName", async () => {
    getActiveServer.mockResolvedValue({ dockerContainerId: "abc123", dockerContainerName: "pz" });
    expect(await resolveActiveContainerRef()).toBe("abc123");
  });

  it("falls back to dockerContainerName when no id is set", async () => {
    getActiveServer.mockResolvedValue({ dockerContainerId: null, dockerContainerName: "pz" });
    expect(await resolveActiveContainerRef()).toBe("pz");
  });

  it("returns null when the active server isn't docker-backed", async () => {
    getActiveServer.mockResolvedValue({ dockerContainerId: null, dockerContainerName: null });
    expect(await resolveActiveContainerRef()).toBeNull();
  });
});

describe("ContainerStatsPoller", () => {
  let io;
  const sampleStats = {
    cpu: { usagePercent: 12, cores: 4 },
    memory: { used: 100, limit: 200, usagePercent: 50 },
    disk: { read: 1, write: 2 },
    network: { rxBytes: 3, txBytes: 4 },
  };

  beforeEach(() => {
    io = { emit: vi.fn() };
  });

  function makeClient({ available = true, stats = sampleStats } = {}) {
    return { available, getContainerStats: vi.fn(async () => stats) };
  }

  it("does nothing when the docker client is unavailable", async () => {
    const client = makeClient({ available: false });
    const poller = new ContainerStatsPoller(io, client, { resolveRef: async () => "c1" });

    const result = await poller.checkNow();

    expect(result).toBeNull();
    expect(io.emit).not.toHaveBeenCalled();
  });

  it("does nothing when the active server isn't docker-backed", async () => {
    const client = makeClient();
    const poller = new ContainerStatsPoller(io, client, { resolveRef: async () => null });

    const result = await poller.checkNow();

    expect(result).toBeNull();
    expect(client.getContainerStats).not.toHaveBeenCalled();
    expect(io.emit).not.toHaveBeenCalled();
  });

  it("fetches stats for the resolved container and emits container:stats", async () => {
    const client = makeClient();
    const poller = new ContainerStatsPoller(io, client, { resolveRef: async () => "c1" });

    const result = await poller.checkNow();

    expect(client.getContainerStats).toHaveBeenCalledWith("c1");
    expect(result).toEqual({ containerId: "c1", ...sampleStats });
    expect(io.emit).toHaveBeenCalledWith("container:stats", { containerId: "c1", ...sampleStats });
  });

  it("caches the last stats on getLastStats()", async () => {
    const client = makeClient();
    const poller = new ContainerStatsPoller(io, client, { resolveRef: async () => "c1" });
    expect(poller.getLastStats()).toBeNull();

    await poller.checkNow();

    expect(poller.getLastStats()).toEqual({ containerId: "c1", ...sampleStats });
  });

  it("clears lastStats and does not emit when the container has no stats", async () => {
    const client = makeClient({ stats: null });
    const poller = new ContainerStatsPoller(io, client, { resolveRef: async () => "c1" });

    await poller.checkNow();

    expect(poller.getLastStats()).toBeNull();
    expect(io.emit).not.toHaveBeenCalled();
  });

  it("does nothing when io is not provided", async () => {
    const client = makeClient();
    const poller = new ContainerStatsPoller(null, client, { resolveRef: async () => "c1" });

    await expect(poller.checkNow()).resolves.toEqual({ containerId: "c1", ...sampleStats });
  });
});
