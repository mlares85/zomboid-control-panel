import { describe, expect, it, vi, beforeEach } from "vitest";

let settingsStore;

vi.mock("../database/init.js", () => ({
  getSetting: vi.fn(async (key) => settingsStore[key] ?? null),
  setSetting: vi.fn(async (key, value) => { settingsStore[key] = value; }),
  getDb: vi.fn(() => ({ data: { users: [{ username: "admin", role: "admin" }] } })),
  commitNow: vi.fn(),
}));

const authService = (await import("../services/auth.js")).default;
const { requireRole } = await import("../services/auth.js");

beforeEach(() => {
  settingsStore = { authEnabled: true };
});

function fakeReq(path, { user, trustProxy } = {}) {
  const req = {
    path,
    headers: {},
    user: user ?? undefined,
    app: { get: vi.fn((key) => key === "trust proxy" ? (trustProxy ?? false) : undefined) },
  };
  return req;
}

function fakeRes() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return res;
}

describe("auth middleware — public path allowlist (de37ad2)", () => {
  it("allows /api/auth/login without a token", async () => {
    const next = vi.fn();
    const mw = authService.middleware();
    await mw(fakeReq("/api/auth/login"), fakeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it("allows /api/auth/status without a token", async () => {
    const next = vi.fn();
    await authService.middleware()(fakeReq("/api/auth/status"), fakeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it("allows /api/auth/setup without a token", async () => {
    const next = vi.fn();
    await authService.middleware()(fakeReq("/api/auth/setup"), fakeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it("allows /api/auth/recover-with-code without a token", async () => {
    const next = vi.fn();
    await authService.middleware()(fakeReq("/api/auth/recover-with-code"), fakeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it("blocks /api/auth/recovery-codes without a token", async () => {
    const res = fakeRes();
    const next = vi.fn();
    await authService.middleware()(fakeReq("/api/auth/recovery-codes"), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("blocks /api/auth/me without a token", async () => {
    const res = fakeRes();
    const next = vi.fn();
    await authService.middleware()(fakeReq("/api/auth/me"), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("blocks /api/auth/change-password without a token", async () => {
    const res = fakeRes();
    const next = vi.fn();
    await authService.middleware()(fakeReq("/api/auth/change-password"), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe("requireRole — fail closed (ad3f7d8)", () => {
  it("returns 401 when req.user is undefined", () => {
    const res = fakeRes();
    const next = vi.fn();
    requireRole("admin")(fakeReq("/anything"), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("passes through when req.user has the required role", () => {
    const next = vi.fn();
    requireRole("admin")(fakeReq("/anything", { user: { role: "admin" } }), fakeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it("returns 403 when req.user has a different role", () => {
    const res = fakeRes();
    const next = vi.fn();
    requireRole("admin")(fakeReq("/anything", { user: { role: "viewer" } }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe("auth middleware — synthetic user during setup/auth-disabled", () => {
  it("sets a synthetic admin user when auth is disabled", async () => {
    settingsStore = { authEnabled: false };
    const req = fakeReq("/api/servers");
    const next = vi.fn();
    await authService.middleware()(req, fakeRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ role: "admin", synthetic: true });
  });
});
