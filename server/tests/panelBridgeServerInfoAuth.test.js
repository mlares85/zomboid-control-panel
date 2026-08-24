import { describe, expect, it, vi } from "vitest";

vi.mock("../database/init.js", () => ({
  getActiveServer: vi.fn(),
  getServer: vi.fn(),
  getAllSettings: vi.fn(),
  setSetting: vi.fn(),
  getDb: vi.fn(),
  commitNow: vi.fn(),
  logBridgeCommand: vi.fn(),
}));

const { default: router } = await import("../routes/panelBridge.js");
const { findRouteLayer } = await import("./helpers/routerLayer.js");

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

// GET /server-info returns every online player's exact x/y/z position and
// current health (handlers.getServerInfo in PanelBridge.lua). It previously
// had no role gate at all -- any authenticated session, any role, could
// read it. Gated requireRole("admin") as its first handler, same as every
// other privileged PanelBridge route (/command, /sftp/*, /install-mod*).
describe("panelBridge.js: GET /server-info requires admin", () => {
  it("has a requireRole gate as its first handler", () => {
    const layer = findRouteLayer(router.stack, "/server-info", "get");
    expect(layer.route.stack.length).toBe(4);
  });

  it("rejects a non-admin authenticated user before touching bridge state", async () => {
    const layer = findRouteLayer(router.stack, "/server-info", "get");
    const gate = layer.route.stack[0].handle;
    const response = createResponse();
    const next = vi.fn();

    await gate({ user: { role: "viewer" } }, response, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("does not reject an admin", async () => {
    const layer = findRouteLayer(router.stack, "/server-info", "get");
    const gate = layer.route.stack[0].handle;
    const response = createResponse();
    const next = vi.fn();

    await gate({ user: { role: "admin" } }, response, next);

    expect(next).toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalledWith(403);
  });
});
