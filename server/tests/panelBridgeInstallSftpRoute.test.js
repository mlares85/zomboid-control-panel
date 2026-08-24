import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../database/init.js", () => ({
  getActiveServer: vi.fn(),
  getServer: vi.fn(),
  getAllSettings: vi.fn(),
  setSetting: vi.fn(),
  getDb: vi.fn(),
  commitNow: vi.fn(),
  logBridgeCommand: vi.fn(),
}));

const installBridgeViaSftp = vi.fn();
vi.mock("../services/panelBridgeSftpInstaller.js", () => ({
  installBridgeViaSftp: (...args) => installBridgeViaSftp(...args),
}));

const { default: router } = await import("../routes/panelBridge.js");
const { findRouteLayer } = await import("./helpers/routerLayer.js");

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

function getLayer(routePath, method) {
  return findRouteLayer(router.stack, routePath, method);
}

async function runRoute(routePath, method, req, res) {
  const layer = getLayer(routePath, method);
  const handlers = layer.route.stack.map((s) => s.handle);
  let idx = -1;
  const next = async (err) => {
    idx++;
    if (err) throw err;
    if (idx < handlers.length) await handlers[idx](req, res, next);
  };
  await next();
}

const validBody = {
  host: "pz.example.net",
  port: 22,
  username: "pzuser",
  password: "not-a-real-secret",
  installPath: "/home/pzuser/pzserver",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /install-sftp requires admin", () => {
  it("rejects a non-admin authenticated user", async () => {
    const response = createResponse();
    await runRoute(
      "/install-sftp",
      "post",
      { body: validBody, user: { role: "viewer" } },
      response,
    );
    expect(response.status).toHaveBeenCalledWith(403);
    expect(installBridgeViaSftp).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    const response = createResponse();
    await runRoute("/install-sftp", "post", { body: validBody }, response);
    expect(response.status).toHaveBeenCalledWith(401);
  });
});

describe("POST /install-sftp validation", () => {
  it.each(["host", "port", "username", "password", "installPath"])(
    "rejects a request missing %s",
    async (field) => {
      const response = createResponse();
      const body = { ...validBody, [field]: "" };
      await runRoute(
        "/install-sftp",
        "post",
        { body, user: { role: "admin" } },
        response,
      );
      expect(response.status).toHaveBeenCalledWith(400);
      expect(installBridgeViaSftp).not.toHaveBeenCalled();
    },
  );
});

describe("POST /install-sftp", () => {
  it("calls installBridgeViaSftp and returns success", async () => {
    installBridgeViaSftp.mockResolvedValue({
      success: true,
      remotePath: "/home/pzuser/pzserver/media/lua/server/PanelBridge.lua",
    });
    const response = createResponse();
    await runRoute(
      "/install-sftp",
      "post",
      { body: validBody, user: { role: "admin" } },
      response,
    );

    expect(installBridgeViaSftp).toHaveBeenCalledWith(
      {
        host: "pz.example.net",
        port: 22,
        username: "pzuser",
        password: "not-a-real-secret",
      },
      "/home/pzuser/pzserver",
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it("returns a 400 with the failure payload when the installer reports failure", async () => {
    installBridgeViaSftp.mockResolvedValue({
      success: false,
      error: "ECONNREFUSED",
    });
    const response = createResponse();
    await runRoute(
      "/install-sftp",
      "post",
      { body: validBody, user: { role: "admin" } },
      response,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: "ECONNREFUSED",
    });
  });

  it("returns a 500 without leaking internals when the installer throws", async () => {
    installBridgeViaSftp.mockRejectedValue(new Error("boom"));
    const response = createResponse();
    await runRoute(
      "/install-sftp",
      "post",
      { body: validBody, user: { role: "admin" } },
      response,
    );

    expect(response.status).toHaveBeenCalledWith(500);
  });
});
