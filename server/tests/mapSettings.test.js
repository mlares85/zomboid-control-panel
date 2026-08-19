import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the dependencies that settings.js imports
vi.mock("../routes/mapProxy/b42Resolution.js", () => ({
  getResolutionState: vi.fn(() => ({
    currentDirectory: "42.20.0",
    ttlMs: 86400000,
    lastResolvedAt: Date.now(),
    nextResolveAt: Date.now() + 86400000,
    geometry: { tileSize: 2048, width: 2318656, height: 1019040, maxLevel: 22 },
  })),
  invalidateResolutionCache: vi.fn(),
}));

vi.mock("../routes/mapProxy/tileCache.js", () => ({
  TILE_CACHE_DIR: "/tmp/fake-tile-cache",
}));

vi.mock("fs", () => ({
  default: {
    promises: {
      readdir: vi.fn(async () => []),
      stat: vi.fn(async () => ({ size: 0 })),
    },
  },
}));

const { default: router } = await import("../routes/mapProxy/settings.js");

function createResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

function getHandler(routePath, method) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === routePath && entry.route.methods[method],
  );
  if (!layer) throw new Error(`No handler for ${method.toUpperCase()} ${routePath}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function fakeChecker(overrides = {}) {
  return {
    getStatus: () => ({
      currentVersion: "42.20.0",
      intervalMs: 86400000,
      lastCheckAt: Date.now(),
      lastChangeAt: null,
      nextCheckAt: Date.now() + 86400000,
      availableVersions: [{ directory: "42.20.0", label: "42.20.0", isDefault: true }],
      ...overrides,
    }),
    setInterval: vi.fn(async (ms) => Math.max(3600000, Math.min(604800000, ms))),
    checkNow: vi.fn(async () => ({ version: "42.20.0", changed: false })),
  };
}

describe("GET /settings", () => {
  it("returns checker status, resolution, and cache info", async () => {
    const checker = fakeChecker();
    const req = { app: { get: (key) => (key === "mapVersionChecker" ? checker : undefined) } };
    const res = createResponse();

    await getHandler("/settings", "get")(req, res);

    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.checker.currentVersion).toBe("42.20.0");
    expect(body.resolution).toBeDefined();
    expect(body.resolution.currentDirectory).toBe("42.20.0");
    expect(body.cache).toBeDefined();
  });

  it("returns null checker when service is not available", async () => {
    const req = { app: { get: () => undefined } };
    const res = createResponse();

    await getHandler("/settings", "get")(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.checker).toBeNull();
  });
});

describe("PUT /settings/check-interval", () => {
  it("updates the check interval", async () => {
    const checker = fakeChecker();
    const req = {
      app: { get: (key) => (key === "mapVersionChecker" ? checker : undefined) },
      body: { hours: 12 },
    };
    const res = createResponse();

    await getHandler("/settings/check-interval", "put")(req, res);

    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(checker.setInterval).toHaveBeenCalledWith(43200000);
  });

  it("rejects hours below 1", async () => {
    const checker = fakeChecker();
    const req = {
      app: { get: (key) => (key === "mapVersionChecker" ? checker : undefined) },
      body: { hours: 0 },
    };
    const res = createResponse();

    await getHandler("/settings/check-interval", "put")(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects hours above 168", async () => {
    const checker = fakeChecker();
    const req = {
      app: { get: (key) => (key === "mapVersionChecker" ? checker : undefined) },
      body: { hours: 200 },
    };
    const res = createResponse();

    await getHandler("/settings/check-interval", "put")(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 503 when checker is not available", async () => {
    const req = {
      app: { get: () => undefined },
      body: { hours: 12 },
    };
    const res = createResponse();

    await getHandler("/settings/check-interval", "put")(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
  });
});

describe("POST /settings/check-now", () => {
  it("triggers an immediate check", async () => {
    const checker = fakeChecker();
    const req = { app: { get: (key) => (key === "mapVersionChecker" ? checker : undefined) } };
    const res = createResponse();

    await getHandler("/settings/check-now", "post")(req, res);

    expect(checker.checkNow).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.version).toBe("42.20.0");
  });

  it("returns 503 when checker is not available", async () => {
    const req = { app: { get: () => undefined } };
    const res = createResponse();

    await getHandler("/settings/check-now", "post")(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
  });
});
