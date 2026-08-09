import { beforeEach, describe, expect, it, vi } from "vitest";

const getServers = vi.fn();
const isContainerized = vi.fn();
const getContainerInfo = vi.fn();
const detectDockerRuntime = vi.fn();
const discoverEnvironmentMounts = vi.fn();

vi.mock("../database/init.js", () => ({ getServers }));
vi.mock("../utils/dockerDetect.js", () => ({
  isContainerized,
  getContainerInfo,
  detectDockerRuntime,
}));
vi.mock("../services/mountDiscovery.js", () => ({ discoverEnvironmentMounts }));

const { default: router } = await import("../routes/environment.js");

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

function getHandler() {
  const layer = router.stack.find(
    (entry) => entry.route?.path === "/" && entry.route.methods.get,
  );
  return layer.route.stack[0].handle;
}

describe("GET /api/system/environment", () => {
  beforeEach(() => {
    getServers.mockReset().mockResolvedValue([{ id: "1" }, { id: "2" }]);
    isContainerized.mockReset().mockReturnValue(true);
    getContainerInfo.mockReset().mockReturnValue({
      containerized: true,
      hasDockerSocket: false,
    });
    detectDockerRuntime.mockReset().mockReturnValue(null);
    discoverEnvironmentMounts.mockReset().mockReturnValue([
      { path: "/pz-server", type: "install" },
    ]);
  });

  it("composes platform, docker, mounts, and server count into one snapshot", async () => {
    const response = createResponse();
    const originalEnv = {
      PZ_SERVER_PATH: process.env.PZ_SERVER_PATH,
      PZ_SAVE_PATH: process.env.PZ_SAVE_PATH,
    };
    process.env.PZ_SERVER_PATH = "/pz-server";
    delete process.env.PZ_SAVE_PATH;

    try {
      await getHandler()({}, response);
    } finally {
      process.env.PZ_SERVER_PATH = originalEnv.PZ_SERVER_PATH;
      process.env.PZ_SAVE_PATH = originalEnv.PZ_SAVE_PATH;
    }

    expect(response.json).toHaveBeenCalledWith({
      platform: process.platform,
      containerized: true,
      hasDockerSocket: false,
      envPaths: {
        PZ_SERVER_PATH: "/pz-server",
        PZ_SAVE_PATH: null,
      },
      discoveredMounts: [{ path: "/pz-server", type: "install" }],
      serverCount: 2,
      platformGuidance: {
        platform: process.platform,
        canRunNative: process.platform !== "darwin",
        canRunDocker: false,
        dockerRuntime: null,
        recommendations: process.platform === "darwin" ? expect.any(Array) : [],
      },
    });
  });

  it("treats a mounted Docker socket as a native runtime without shelling out", async () => {
    getContainerInfo.mockReturnValue({ containerized: true, hasDockerSocket: true });
    const response = createResponse();

    await getHandler()({}, response);

    expect(detectDockerRuntime).not.toHaveBeenCalled();
    const body = response.json.mock.calls[0][0];
    expect(body.platformGuidance.dockerRuntime).toBe("native");
    expect(body.platformGuidance.canRunDocker).toBe(true);
  });

  it("falls back to detectDockerRuntime when no Docker socket is mounted", async () => {
    getContainerInfo.mockReturnValue({ containerized: false, hasDockerSocket: false });
    detectDockerRuntime.mockReturnValue("orbstack");
    const response = createResponse();

    await getHandler()({}, response);

    expect(detectDockerRuntime).toHaveBeenCalled();
    const body = response.json.mock.calls[0][0];
    expect(body.platformGuidance.dockerRuntime).toBe("orbstack");
    expect(body.platformGuidance.canRunDocker).toBe(true);
  });

  it("returns a 500 with a sanitized error when the snapshot fails to build", async () => {
    getServers.mockRejectedValue(new Error("db locked"));
    const response = createResponse();

    await getHandler()({}, response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });
});
