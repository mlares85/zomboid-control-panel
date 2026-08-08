import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getActiveServer = vi.fn();
vi.mock("../database/init.js", () => ({
  getActiveServer,
}));

const runSafeModUpdate = vi.fn();
const isSafeUpdateInProgress = vi.fn(() => false);
vi.mock("../services/safeModUpdate.js", () => ({
  runSafeModUpdate,
  isSafeUpdateInProgress,
  clampWarningSeconds: (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return 30;
    return Math.min(Math.round(n), 600);
  },
}));

const { default: router } = await import("../routes/mods/safeUpdate.js");

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

function getHandler(pathname, method = "post") {
  const layer = router.stack.find(
    (entry) => entry.route?.path === pathname && entry.route.methods[method],
  );
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function makeApp(services) {
  return { get: (key) => services[key] };
}

describe("POST /api/mods/safe-update", () => {
  beforeEach(() => {
    getActiveServer.mockReset().mockResolvedValue(null);
    isSafeUpdateInProgress.mockReset().mockReturnValue(false);
    runSafeModUpdate.mockReset().mockResolvedValue({ success: true });
  });

  it("rejects when required services are missing", async () => {
    const res = createResponse();
    await getHandler("/safe-update")(
      { app: makeApp({}), body: {} },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("refuses remote servers", async () => {
    getActiveServer.mockResolvedValue({ isRemote: true });
    const res = createResponse();
    const services = {
      modChecker: {},
      backupService: {},
      serverManager: { checkServerRunning: vi.fn() },
      rconService: { connected: true },
    };

    await getHandler("/safe-update")({ app: makeApp(services), body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(services.serverManager.checkServerRunning).not.toHaveBeenCalled();
  });

  it("returns 409 when a safe update is already running", async () => {
    isSafeUpdateInProgress.mockReturnValue(true);
    const res = createResponse();
    const services = {
      modChecker: {},
      backupService: {},
      serverManager: { checkServerRunning: vi.fn() },
      rconService: { connected: true },
    };

    await getHandler("/safe-update")({ app: makeApp(services), body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("returns 400 when the server is not running", async () => {
    const res = createResponse();
    const services = {
      modChecker: {},
      backupService: {},
      serverManager: { checkServerRunning: vi.fn().mockResolvedValue(false) },
      rconService: { connected: true },
    };

    await getHandler("/safe-update")({ app: makeApp(services), body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/not running/) }),
    );
  });

  it("returns 400 when RCON is not connected", async () => {
    const res = createResponse();
    const services = {
      modChecker: {},
      backupService: {},
      serverManager: { checkServerRunning: vi.fn().mockResolvedValue(true) },
      rconService: { connected: false },
    };

    await getHandler("/safe-update")({ app: makeApp(services), body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/RCON/) }),
    );
  });

  it("starts the orchestration in the background and responds immediately", async () => {
    let resolveRun;
    runSafeModUpdate.mockReturnValue(
      new Promise((resolve) => {
        resolveRun = resolve;
      }),
    );
    const res = createResponse();
    const services = {
      modChecker: {},
      backupService: {},
      serverManager: { checkServerRunning: vi.fn().mockResolvedValue(true) },
      rconService: { connected: true },
      io: { emit: vi.fn() },
    };

    await getHandler("/safe-update")(
      { app: makeApp(services), body: { warningSeconds: 45 } },
      res,
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, warningSeconds: 45 }),
    );
    expect(runSafeModUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ warningSeconds: 45, io: services.io }),
    );
    // The response must not wait for the (still-pending) orchestration.
    resolveRun({ success: true });
  });
});

describe("GET /api/mods/safe-update/status", () => {
  it("reports whether an update is running", () => {
    isSafeUpdateInProgress.mockReturnValue(true);
    const res = createResponse();

    getHandler("/safe-update/status", "get")({}, res);

    expect(res.json).toHaveBeenCalledWith({ inProgress: true });
  });
});
