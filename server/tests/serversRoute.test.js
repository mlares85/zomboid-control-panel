import { beforeEach, describe, expect, it, vi } from "vitest";

const createServer = vi.fn();
const updateServer = vi.fn();
<<<<<<< HEAD
=======
const getServers = vi.fn();
>>>>>>> worktree-agent-adda9304c03ba6fd0

vi.mock("../database/init.js", () => ({
  getServers,
  getServer: vi.fn(),
  getActiveServer: vi.fn(),
  createServer,
  updateServer,
  deleteServer: vi.fn(),
  setActiveServer: vi.fn(),
  getAllSettings: vi.fn(),
}));

const { default: router } = await import("../routes/servers.js");

function createResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

<<<<<<< HEAD
// Routes may live directly on `router` or be nested under sub-routers
// (see server/routes/servers/index.js), so this walks the stack recursively.
function findLayer(stack, path, method) {
  for (const entry of stack) {
    if (entry.route?.path === path && entry.route.methods[method]) {
      return entry.route.stack[0].handle;
    }
    if (entry.name === "router" && entry.handle?.stack) {
      const found = findLayer(entry.handle.stack, path, method);
      if (found) return found;
    }
  }
  return null;
}

function getCreateHandler() {
  return findLayer(router.stack, "/", "post");
}

function getUpdateHandler() {
  const layer = router.stack.find(
    (entry) => entry.route?.path === "/:id" && entry.route.methods.put,
=======
function getLayer(routePath, method) {
  return router.stack.find(
    (entry) => entry.route?.path === routePath && entry.route.methods[method],
>>>>>>> worktree-agent-adda9304c03ba6fd0
  );
}

function getCreateHandler() {
  return getLayer("/", "post").route.stack[0].handle;
}

function getUpdateHandler() {
  const layer = getLayer("/:id", "put");
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

// Runs every middleware in a route's stack (in order), so admin-gating
// middleware like requireRole is exercised too, not just the final handler.
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

describe("POST /api/servers", () => {
  beforeEach(() => {
    createServer.mockReset();
    createServer.mockResolvedValue({ id: "server-id", name: "Test Server" });
  });

  it("persists the setup admin password for first server startup", async () => {
    const response = createResponse();

    await getCreateHandler()(
      {
        body: {
          name: "Test Server",
          installPath: "C:\\PZ",
          rconHost: "127.0.0.1",
          rconPort: 27015,
          rconPassword: "rcon-password",
          adminPassword: "first-boot-password",
        },
      },
      response,
    );

    expect(createServer).toHaveBeenCalledWith(
      expect.objectContaining({ adminPassword: "first-boot-password" }),
    );
    expect(response.status).toHaveBeenCalledWith(201);
  });

<<<<<<< HEAD
  it("passes an explicit valid provider through to createServer", async () => {
=======
  it("rejects a serverName containing a path traversal sequence", async () => {
>>>>>>> worktree-agent-adda9304c03ba6fd0
    const response = createResponse();

    await getCreateHandler()(
      {
        body: {
          name: "Test Server",
          installPath: "C:\\PZ",
          rconHost: "127.0.0.1",
          rconPort: 27015,
          rconPassword: "rcon-password",
<<<<<<< HEAD
          provider: "docker-local",
        },
      },
      response,
    );

    expect(createServer).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "docker-local" }),
    );
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it("rejects an unknown provider value with 400", async () => {
    const response = createResponse();

    await getCreateHandler()(
      {
        body: {
          name: "Test Server",
          installPath: "C:\\PZ",
          rconHost: "127.0.0.1",
          rconPort: 27015,
          rconPassword: "rcon-password",
          provider: "not-a-real-provider",
=======
          serverName: "../../etc/passwd",
>>>>>>> worktree-agent-adda9304c03ba6fd0
        },
      },
      response,
    );

    expect(createServer).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
  });

<<<<<<< HEAD
  it("does not require installPath when provider is remote-sftp, even without the legacy isRemote flag", async () => {
=======
  it("masks rconPassword in the create response", async () => {
    createServer.mockResolvedValue({
      id: "server-id",
      name: "Test Server",
      rconPassword: "rcon-password",
    });
>>>>>>> worktree-agent-adda9304c03ba6fd0
    const response = createResponse();

    await getCreateHandler()(
      {
        body: {
          name: "Test Server",
<<<<<<< HEAD
          rconHost: "somehost.example.com",
          rconPort: 27015,
          rconPassword: "rcon-password",
          provider: "remote-sftp",
=======
          installPath: "C:\\PZ",
          rconHost: "127.0.0.1",
          rconPort: 27015,
          rconPassword: "rcon-password",
>>>>>>> worktree-agent-adda9304c03ba6fd0
        },
      },
      response,
    );

<<<<<<< HEAD
    expect(createServer).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "remote-sftp", isRemote: true }),
    );
    expect(response.status).toHaveBeenCalledWith(201);
=======
    const payload = response.json.mock.calls[0][0];
    expect(payload.server.rconPassword).not.toBe("rcon-password");
>>>>>>> worktree-agent-adda9304c03ba6fd0
  });
});

describe("PUT /api/servers/:id", () => {
  beforeEach(() => {
    updateServer.mockReset();
<<<<<<< HEAD
    updateServer.mockResolvedValue({ id: "server-id", name: "Test Server" });
  });

  it("passes a valid provider through to updateServer", async () => {
    const response = createResponse();

    await getUpdateHandler()(
      { params: { id: "server-id" }, body: { provider: "native" } },
      response,
    );

    expect(updateServer).toHaveBeenCalledWith(
      "server-id",
      expect.objectContaining({ provider: "native" }),
    );
  });

  it("rejects an unknown provider value with 400", async () => {
    const response = createResponse();

    await getUpdateHandler()(
      { params: { id: "server-id" }, body: { provider: "nonsense" } },
=======
    updateServer.mockResolvedValue({ id: 1, name: "Test Server" });
  });

  it("rejects a serverName containing a path traversal sequence", async () => {
    const response = createResponse();

    await getUpdateHandler()(
      { params: { id: "1" }, body: { serverName: "../../etc" } },
>>>>>>> worktree-agent-adda9304c03ba6fd0
      response,
    );

    expect(updateServer).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
  });
<<<<<<< HEAD
=======

  it("accepts a valid serverName", async () => {
    const response = createResponse();

    await getUpdateHandler()(
      { params: { id: "1" }, body: { serverName: "My-Server_2" } },
      response,
    );

    expect(updateServer).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ serverName: "My-Server_2" }),
    );
  });

  it("drops a masked rconPassword instead of overwriting the stored secret", async () => {
    const response = createResponse();

    await getUpdateHandler()(
      { params: { id: "1" }, body: { rconPassword: "••••••••ab12" } },
      response,
    );

    expect(updateServer).toHaveBeenCalledWith(
      1,
      expect.not.objectContaining({ rconPassword: expect.anything() }),
    );
  });
});

describe("GET /api/servers", () => {
  it("masks rconPassword/adminPassword for every server in the list", async () => {
    getServers.mockResolvedValue([
      { id: 1, name: "A", rconPassword: "secret-a", adminPassword: "admin-a" },
      { id: 2, name: "B", rconPassword: "secret-b" },
    ]);
    const response = createResponse();
    const layer = getLayer("/", "get");

    await layer.route.stack[0].handle({}, response);

    const payload = response.json.mock.calls[0][0];
    expect(payload.servers[0].rconPassword).not.toBe("secret-a");
    expect(payload.servers[0].adminPassword).not.toBe("admin-a");
    expect(payload.servers[1].rconPassword).not.toBe("secret-b");
  });
});

describe("Admin-gated server discovery routes", () => {
  it("rejects POST /auto-scan for a non-admin authenticated user", async () => {
    const response = createResponse();
    await runRoute(
      "/auto-scan",
      "post",
      { body: {}, user: { role: "viewer" } },
      response,
    );
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it("rejects POST /detect for a non-admin authenticated user", async () => {
    const response = createResponse();
    await runRoute(
      "/detect",
      "post",
      { body: {}, user: { role: "viewer" } },
      response,
    );
    expect(response.status).toHaveBeenCalledWith(403);
  });
>>>>>>> worktree-agent-adda9304c03ba6fd0
});
