import { describe, expect, it, vi } from "vitest";

// GET /api/backup/download/:name used to have NO auth gate at all -- any
// authenticated (or, before auth is configured, any) request could
// exfiltrate a full backup archive, including db.json if includeDb was
// ever turned on (bcrypt password hashes). Every sibling mutating route
// on this router (delete, restore, delete-older-than, upload) already
// requires requireRole("admin"); download was the odd one out.
vi.mock("../database/init.js", () => ({
  getActiveServer: vi.fn(),
}));

const { default: router } = await import("../routes/backup.js");
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

describe("GET /api/backup/download/:name requires admin", () => {
  it("refuses a non-admin authenticated user", async () => {
    const response = createResponse();
    await runRoute(
      "/download/:name",
      "get",
      { params: { name: "backup.zip" }, user: { role: "viewer" }, app: { get: () => null } },
      response,
    );
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it("passes through to the handler for an admin user", async () => {
    const response = createResponse();
    const backupService = {
      getBackupsPath: vi.fn(async () => null),
    };
    await runRoute(
      "/download/:name",
      "get",
      {
        params: { name: "backup.zip" },
        user: { role: "admin" },
        app: { get: (key) => (key === "backupService" ? backupService : null) },
      },
      response,
    );
    // Reaches the real handler (proven by it calling getBackupsPath),
    // rather than being rejected by the admin gate.
    expect(backupService.getBackupsPath).toHaveBeenCalled();
  });
});
