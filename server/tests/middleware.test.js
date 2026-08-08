import { beforeEach, describe, expect, it, vi } from "vitest";

const getActiveServer = vi.fn();
vi.mock("../database/init.js", () => ({ getActiveServer }));

const { requireRcon } = await import("../middleware/requireRcon.js");
const { requireBridge } = await import("../middleware/requireBridge.js");
const { requireActiveServer } = await import(
  "../middleware/requireActiveServer.js"
);
const { requireServerRunning } = await import(
  "../middleware/requireServerRunning.js"
);
const { bridge } = await import("../services/panelBridge.js");

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

function createRequest(services = {}) {
  return { app: { get: (key) => services[key] } };
}

describe("requireRcon", () => {
  it("calls next() when RCON is connected", () => {
    const req = createRequest({ rconService: { isConnected: () => true } });
    const res = createResponse();
    const next = vi.fn();

    requireRcon()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.rconService).toBeDefined();
  });

  it("returns the default error response when RCON is not connected", () => {
    const req = createRequest({ rconService: { isConnected: () => false } });
    const res = createResponse();
    const next = vi.fn();

    requireRcon()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "RCON not connected" });
  });

  it("returns the caller's custom status/body when RCON is not connected", () => {
    const req = createRequest({ rconService: null });
    const res = createResponse();
    const next = vi.fn();

    requireRcon({
      status: 400,
      body: { error: "RCON not connected. Cannot gracefully stop server." },
    })(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      error: "RCON not connected. Cannot gracefully stop server.",
    });
  });
});

describe("requireBridge", () => {
  beforeEach(() => {
    bridge.isRunning = false;
  });

  it("calls next() when the bridge is running", () => {
    bridge.isRunning = true;
    const req = {};
    const res = createResponse();
    const next = vi.fn();

    requireBridge(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.bridge).toBe(bridge);
  });

  it("matches the existing 'Bridge not running' response when not running", () => {
    const req = {};
    const res = createResponse();
    const next = vi.fn();

    requireBridge(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Bridge not running. Start it first.",
    });
  });
});

describe("requireActiveServer", () => {
  beforeEach(() => {
    getActiveServer.mockReset();
  });

  it("calls next() and attaches req.activeServer when one is configured", async () => {
    getActiveServer.mockResolvedValue({ id: 1, name: "Test Server" });
    const req = createRequest();
    const res = createResponse();
    const next = vi.fn();

    await requireActiveServer()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.activeServer).toEqual({ id: 1, name: "Test Server" });
  });

  it("returns the default 404 response when no active server exists", async () => {
    getActiveServer.mockResolvedValue(null);
    const req = createRequest();
    const res = createResponse();
    const next = vi.fn();

    await requireActiveServer()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: "No active server configured",
    });
  });

  it("matches a caller's custom status/body", async () => {
    getActiveServer.mockResolvedValue(null);
    const req = createRequest();
    const res = createResponse();
    const next = vi.fn();

    await requireActiveServer({
      status: 400,
      body: { success: false, error: "No active server is configured." },
    })(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "No active server is configured.",
    });
  });
});

describe("requireServerRunning", () => {
  it("calls next() when the server process is running", async () => {
    const req = createRequest({
      serverManager: { checkServerRunning: vi.fn().mockResolvedValue(true) },
    });
    const res = createResponse();
    const next = vi.fn();

    await requireServerRunning()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns the default error response when not running", async () => {
    const req = createRequest({
      serverManager: { checkServerRunning: vi.fn().mockResolvedValue(false) },
    });
    const res = createResponse();
    const next = vi.fn();

    await requireServerRunning()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Server is not running",
    });
  });

  it("falls back to serverManager.isRunning when checkServerRunning is unavailable", async () => {
    const req = createRequest({ serverManager: { isRunning: true } });
    const res = createResponse();
    const next = vi.fn();

    await requireServerRunning()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
