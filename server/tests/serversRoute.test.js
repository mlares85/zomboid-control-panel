import { beforeEach, describe, expect, it, vi } from "vitest";

const createServer = vi.fn();
const updateServer = vi.fn();

vi.mock("../database/init.js", () => ({
  getServers: vi.fn(),
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
  );
  return layer.route.stack[0].handle;
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

  it("passes an explicit valid provider through to createServer", async () => {
    const response = createResponse();

    await getCreateHandler()(
      {
        body: {
          name: "Test Server",
          installPath: "C:\\PZ",
          rconHost: "127.0.0.1",
          rconPort: 27015,
          rconPassword: "rcon-password",
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
        },
      },
      response,
    );

    expect(createServer).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
  });

  it("does not require installPath when provider is remote-sftp, even without the legacy isRemote flag", async () => {
    const response = createResponse();

    await getCreateHandler()(
      {
        body: {
          name: "Test Server",
          rconHost: "somehost.example.com",
          rconPort: 27015,
          rconPassword: "rcon-password",
          provider: "remote-sftp",
        },
      },
      response,
    );

    expect(createServer).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "remote-sftp", isRemote: true }),
    );
    expect(response.status).toHaveBeenCalledWith(201);
  });
});

describe("PUT /api/servers/:id", () => {
  beforeEach(() => {
    updateServer.mockReset();
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
      response,
    );

    expect(updateServer).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
  });
});
