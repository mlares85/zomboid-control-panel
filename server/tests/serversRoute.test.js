import { beforeEach, describe, expect, it, vi } from "vitest";

const createServer = vi.fn();

vi.mock("../database/init.js", () => ({
  getServers: vi.fn(),
  getServer: vi.fn(),
  getActiveServer: vi.fn(),
  createServer,
  updateServer: vi.fn(),
  deleteServer: vi.fn(),
  setActiveServer: vi.fn(),
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
});
