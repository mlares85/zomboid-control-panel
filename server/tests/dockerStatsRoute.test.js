import { describe, expect, it, vi } from "vitest";

const { default: router } = await import("../routes/docker.js");

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

function getHandler(path, method = "get") {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method],
  );
  return layer.route.stack[0].handle;
}

function fakeApp(dockerClient) {
  return { get: (key) => (key === "dockerClient" ? dockerClient : undefined) };
}

const sampleStats = {
  cpu: { usagePercent: 10, cores: 2 },
  memory: { used: 1, limit: 2, usagePercent: 50 },
  disk: { read: 0, write: 0 },
  network: { rxBytes: 0, txBytes: 0 },
};

describe("GET /api/docker/containers/:id/stats", () => {
  it("returns 503 when Docker is unavailable", async () => {
    const response = createResponse();

    await getHandler("/containers/:id/stats")({ app: fakeApp(null), params: { id: "c1" } }, response);

    expect(response.status).toHaveBeenCalledWith(503);
  });

  it("returns 502 when stats can't be fetched", async () => {
    const dockerClient = { available: true, getContainerStats: vi.fn().mockResolvedValue(null) };
    const response = createResponse();

    await getHandler("/containers/:id/stats")(
      { app: fakeApp(dockerClient), params: { id: "c1" } },
      response,
    );

    expect(response.status).toHaveBeenCalledWith(502);
  });

  it("returns the parsed stats on success", async () => {
    const dockerClient = { available: true, getContainerStats: vi.fn().mockResolvedValue(sampleStats) };
    const response = createResponse();

    await getHandler("/containers/:id/stats")(
      { app: fakeApp(dockerClient), params: { id: "c1" } },
      response,
    );

    expect(dockerClient.getContainerStats).toHaveBeenCalledWith("c1");
    expect(response.json).toHaveBeenCalledWith(sampleStats);
  });
});

describe("GET /api/docker/stats", () => {
  it("returns an empty object when Docker is unavailable", async () => {
    const response = createResponse();

    await getHandler("/stats")({ app: fakeApp(null) }, response);

    expect(response.json).toHaveBeenCalledWith({});
  });

  it("keys stats by both container id and bare name, running containers only", async () => {
    const containers = [
      { Id: "c1", Names: ["/pz1"], State: "running" },
      { Id: "c2", Names: ["/pz2"], State: "exited" },
    ];
    const dockerClient = {
      available: true,
      findPZContainers: vi.fn().mockResolvedValue(containers),
      getContainerStats: vi.fn().mockResolvedValue(sampleStats),
    };
    const response = createResponse();

    await getHandler("/stats")({ app: fakeApp(dockerClient) }, response);

    expect(dockerClient.getContainerStats).toHaveBeenCalledTimes(1);
    expect(dockerClient.getContainerStats).toHaveBeenCalledWith("c1");
    expect(response.json).toHaveBeenCalledWith({ c1: sampleStats, pz1: sampleStats });
  });

  it("omits containers whose stats fetch failed", async () => {
    const containers = [{ Id: "c1", Names: ["/pz1"], State: "running" }];
    const dockerClient = {
      available: true,
      findPZContainers: vi.fn().mockResolvedValue(containers),
      getContainerStats: vi.fn().mockResolvedValue(null),
    };
    const response = createResponse();

    await getHandler("/stats")({ app: fakeApp(dockerClient) }, response);

    expect(response.json).toHaveBeenCalledWith({});
  });
});
