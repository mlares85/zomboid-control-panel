import { beforeEach, describe, expect, it, vi } from "vitest";

const getSetting = vi.fn();
const setSetting = vi.fn();
vi.mock("../database/init.js", () => ({ getSetting, setSetting }));

const sendNotification = vi.fn();
const validateConfig = vi.fn();
const PushoverServiceMock = vi.fn().mockImplementation(function PushoverService() {
  return { sendNotification, validateConfig };
});
vi.mock("../services/pushoverService.js", () => ({ PushoverService: PushoverServiceMock }));

const { default: router } = await import("../routes/pushover.js");
const { DEFAULT_CONDITIONS } = await import("../services/alertConditions.js");
const { findRouteLayer } = await import("./helpers/routerLayer.js");

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

async function runRoute(routePath, method, req, res) {
  const layer = findRouteLayer(router.stack, routePath, method);
  const handlers = layer.route.stack.map((s) => s.handle);
  let idx = -1;
  const next = async (err) => {
    idx++;
    if (err) throw err;
    if (idx < handlers.length) await handlers[idx](req, res, next);
  };
  await next();
}

const adminUser = { username: "admin", role: "admin" };
const viewerUser = { username: "viewer", role: "viewer" };
function baseReq(overrides = {}) {
  return { user: adminUser, app: { get: () => null }, body: {}, ...overrides };
}

beforeEach(() => {
  getSetting.mockReset();
  setSetting.mockReset();
  sendNotification.mockReset();
  validateConfig.mockReset();
  PushoverServiceMock.mockClear();
});

describe("GET /api/pushover/settings", () => {
  it("rejects a non-admin user", async () => {
    const res = createResponse();
    await runRoute("/settings", "get", baseReq({ user: viewerUser }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns masked apiToken and does not leak the real value", async () => {
    getSetting.mockImplementation((key) =>
      ({ pushoverUserKey: "u123", pushoverApiToken: "supersecrettoken", pushoverEnabled: true })[key] ?? null,
    );
    const res = createResponse();
    await runRoute("/settings", "get", baseReq(), res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.userKey).toBe("u123");
    expect(payload.apiToken).not.toBe("supersecrettoken");
    expect(payload.apiToken).toContain("••••");
    expect(payload.hasApiToken).toBe(true);
    expect(payload.enabled).toBe(true);
  });

  it("reports hasApiToken false when unconfigured", async () => {
    getSetting.mockResolvedValue(null);
    const res = createResponse();
    await runRoute("/settings", "get", baseReq(), res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.hasApiToken).toBe(false);
  });
});

describe("PUT /api/pushover/settings", () => {
  it("rejects a non-admin user", async () => {
    const res = createResponse();
    await runRoute(
      "/settings",
      "put",
      baseReq({ user: viewerUser, body: { userKey: "u", apiToken: "t" } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("requires userKey and apiToken", async () => {
    const res = createResponse();
    await runRoute("/settings", "put", baseReq({ body: { userKey: "" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("validates the new credentials with a test push before saving", async () => {
    validateConfig.mockResolvedValue({ success: true });
    const res = createResponse();
    await runRoute("/settings", "put", baseReq({ body: { userKey: "u", apiToken: "t", enabled: true } }), res);

    expect(validateConfig).toHaveBeenCalled();
    expect(setSetting).toHaveBeenCalledWith("pushoverUserKey", "u");
    expect(setSetting).toHaveBeenCalledWith("pushoverApiToken", "t");
    expect(setSetting).toHaveBeenCalledWith("pushoverEnabled", true);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("rejects and does not save when Pushover validation fails", async () => {
    validateConfig.mockResolvedValue({ success: false, error: "invalid token" });
    const res = createResponse();
    await runRoute("/settings", "put", baseReq({ body: { userKey: "u", apiToken: "bad" } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(setSetting).not.toHaveBeenCalledWith("pushoverApiToken", "bad");
  });

  it("keeps the existing apiToken when the client echoes back a masked value", async () => {
    getSetting.mockImplementation((key) => (key === "pushoverApiToken" ? "realtoken1234" : null));
    validateConfig.mockResolvedValue({ success: true });
    const res = createResponse();
    await runRoute(
      "/settings",
      "put",
      baseReq({ body: { userKey: "u", apiToken: "••••••••1234" } }),
      res,
    );

    expect(setSetting).toHaveBeenCalledWith("pushoverApiToken", "realtoken1234");
  });
});

describe("POST /api/pushover/test", () => {
  it("rejects a non-admin user", async () => {
    const res = createResponse();
    await runRoute("/test", "post", baseReq({ user: viewerUser }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("errors when Pushover is not configured", async () => {
    getSetting.mockResolvedValue(null);
    const res = createResponse();
    await runRoute("/test", "post", baseReq(), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("sends a test notification using stored credentials", async () => {
    getSetting.mockImplementation((key) =>
      ({ pushoverUserKey: "u", pushoverApiToken: "t" })[key] ?? null,
    );
    sendNotification.mockResolvedValue({ success: true, request: "abc" });
    const res = createResponse();
    await runRoute("/test", "post", baseReq(), res);
    expect(sendNotification).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("surfaces a Pushover send failure", async () => {
    getSetting.mockImplementation((key) => ({ pushoverUserKey: "u", pushoverApiToken: "t" })[key] ?? null);
    sendNotification.mockResolvedValue({ success: false, error: "boom" });
    const res = createResponse();
    await runRoute("/test", "post", baseReq(), res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});

describe("GET /api/pushover/conditions", () => {
  it("rejects a non-admin user", async () => {
    const res = createResponse();
    await runRoute("/conditions", "get", baseReq({ user: viewerUser }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns the defaults when nothing is stored", async () => {
    getSetting.mockResolvedValue(null);
    const res = createResponse();
    await runRoute("/conditions", "get", baseReq(), res);
    expect(res.json).toHaveBeenCalledWith({ conditions: DEFAULT_CONDITIONS });
  });

  it("returns stored conditions when present", async () => {
    const stored = [{ ...DEFAULT_CONDITIONS[0], threshold: 80 }];
    getSetting.mockResolvedValue(stored);
    const res = createResponse();
    await runRoute("/conditions", "get", baseReq(), res);
    expect(res.json).toHaveBeenCalledWith({ conditions: stored });
  });
});

describe("PUT /api/pushover/conditions", () => {
  it("rejects a non-admin user", async () => {
    const res = createResponse();
    await runRoute("/conditions", "put", baseReq({ user: viewerUser, body: { conditions: [] } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("rejects a non-array payload", async () => {
    const res = createResponse();
    await runRoute("/conditions", "put", baseReq({ body: { conditions: "nope" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects a malformed condition", async () => {
    const res = createResponse();
    await runRoute(
      "/conditions",
      "put",
      baseReq({ body: { conditions: [{ id: "x", operator: "bogus", threshold: 1, enabled: true, metric: "cpu.usagePercent" }] } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("saves a valid conditions array", async () => {
    const conditions = [DEFAULT_CONDITIONS[0]];
    const res = createResponse();
    await runRoute("/conditions", "put", baseReq({ body: { conditions } }), res);
    expect(setSetting).toHaveBeenCalledWith("pushoverConditions", conditions);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe("POST /api/pushover/conditions/reset", () => {
  it("rejects a non-admin user", async () => {
    const res = createResponse();
    await runRoute("/conditions/reset", "post", baseReq({ user: viewerUser }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("resets stored conditions to DEFAULT_CONDITIONS", async () => {
    const res = createResponse();
    await runRoute("/conditions/reset", "post", baseReq(), res);
    expect(setSetting).toHaveBeenCalledWith("pushoverConditions", DEFAULT_CONDITIONS);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, conditions: DEFAULT_CONDITIONS }),
    );
  });
});
