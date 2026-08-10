import { beforeEach, describe, expect, it, vi } from "vitest";

const getServers = vi.fn();
const testRconConnection = vi.fn();
const normalizeRconHost = vi.fn(
  (h) => (typeof h === "string" ? h.trim() || "127.0.0.1" : "127.0.0.1"),
);

vi.mock("../database/init.js", () => ({ getServers }));

vi.mock("../services/rcon.js", () => ({
  testRconConnection,
  normalizeRconHost,
}));

const { default: router } = await import("../routes/servers/rconStatus.js");

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

function getHandler() {
  const layer = router.stack.find(
    (entry) => entry.route?.path === "/rcon-status" && entry.route.methods.get,
  );
  return layer.route.stack[0].handle;
}

describe("GET /rcon-status", () => {
  beforeEach(() => {
    getServers.mockReset();
    testRconConnection.mockReset();
    normalizeRconHost.mockImplementation(
      (h) => (typeof h === "string" ? h.trim() || "127.0.0.1" : "127.0.0.1"),
    );
  });

  it('returns "unconfigured" for servers without rconHost', async () => {
    getServers.mockResolvedValue([
      { id: "s1", rconHost: null, rconPort: null },
    ]);
    const res = createResponse();

    await getHandler()({}, res);

    expect(res.json).toHaveBeenCalledWith({
      servers: [{ id: "s1", status: "unconfigured" }],
    });
    expect(testRconConnection).not.toHaveBeenCalled();
  });

  it('returns "unconfigured" for servers without rconPort', async () => {
    getServers.mockResolvedValue([
      { id: "s1", rconHost: "127.0.0.1", rconPort: null },
    ]);
    const res = createResponse();

    await getHandler()({}, res);

    expect(res.json).toHaveBeenCalledWith({
      servers: [{ id: "s1", status: "unconfigured" }],
    });
    expect(testRconConnection).not.toHaveBeenCalled();
  });

  it('returns "connected" when testRconConnection succeeds', async () => {
    getServers.mockResolvedValue([
      { id: "s1", rconHost: "10.0.0.1", rconPort: 27015, rconPassword: "pw" },
    ]);
    testRconConnection.mockResolvedValue({ success: true });
    const res = createResponse();

    await getHandler()({}, res);

    expect(testRconConnection).toHaveBeenCalledWith({
      host: "10.0.0.1",
      port: 27015,
      password: "pw",
      timeoutMs: 3000,
    });
    expect(res.json).toHaveBeenCalledWith({
      servers: [{ id: "s1", status: "connected" }],
    });
  });

  it('returns "unavailable" when testRconConnection fails', async () => {
    getServers.mockResolvedValue([
      { id: "s1", rconHost: "10.0.0.1", rconPort: 27015, rconPassword: "pw" },
    ]);
    testRconConnection.mockResolvedValue({
      success: false,
      error: "unreachable",
    });
    const res = createResponse();

    await getHandler()({}, res);

    expect(res.json).toHaveBeenCalledWith({
      servers: [{ id: "s1", status: "unavailable" }],
    });
  });

  it("returns 500 with sanitized error when getServers throws", async () => {
    getServers.mockRejectedValue(new Error("db exploded"));
    const res = createResponse();

    await getHandler()({}, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.any(String),
    });
  });

  it("respects concurrency limit (max 3 simultaneous probes)", async () => {
    let active = 0;
    let peak = 0;

    const servers = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`,
      rconHost: "10.0.0.1",
      rconPort: 27015 + i,
      rconPassword: "pw",
    }));
    getServers.mockResolvedValue(servers);

    testRconConnection.mockImplementation(() => {
      active++;
      peak = Math.max(peak, active);
      return new Promise((resolve) => {
        setTimeout(() => {
          active--;
          resolve({ success: true });
        }, 10);
      });
    });

    const res = createResponse();
    await getHandler()({}, res);

    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1); // confirms actual parallelism
    expect(res.json).toHaveBeenCalledWith({
      servers: servers.map((s) => ({ id: s.id, status: "connected" })),
    });
  });
});
