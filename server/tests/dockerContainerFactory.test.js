import { describe, it, expect, vi } from "vitest";
import { createDockerContainerFactory } from "../services/dockerContainerFactory.js";

function fakeDockerClient() {
  return {
    _requestJson: vi.fn(async () => ({ success: true })),
    inspectContainer: vi.fn(async () => null),
    inspectImage: vi.fn(async () => ({ Id: "img123" })),
    pullImage: vi.fn(async () => ({ success: true })),
    createContainer: vi.fn(async () => ({ success: true, id: "ctr123" })),
    removeContainer: vi.fn(async () => ({ success: true })),
    startContainer: vi.fn(async () => ({ success: true })),
  };
}

function fakeVolumeManager() {
  return {
    ensureBaseVolume: vi.fn(async () => ({ success: true })),
    createServerVolume: vi.fn(async () => ({ success: true, volumeName: "zomboid-srv-test" })),
    removeServerVolume: vi.fn(async () => ({ success: true })),
  };
}

describe("buildContainerSpec", () => {
  it("includes 32-bit lib install entrypoint", () => {
    const factory = createDockerContainerFactory(fakeDockerClient(), fakeVolumeManager());
    const spec = factory.buildContainerSpec({
      serverName: "test",
      rconPassword: "secret123",
    });

    // Should have an entrypoint that installs lib32gcc-s1
    expect(spec.Entrypoint).toBeDefined();
    expect(spec.Entrypoint).toHaveLength(3);
    expect(spec.Entrypoint[2]).toContain("lib32gcc-s1");
    expect(spec.Entrypoint[2]).toContain("libstdc++6:i386");
    expect(spec.Entrypoint[2]).toContain("start-server.sh");
  });

  it("includes tmpfs mount for /tmp", () => {
    const factory = createDockerContainerFactory(fakeDockerClient(), fakeVolumeManager());
    const spec = factory.buildContainerSpec({
      serverName: "test",
      rconPassword: "secret123",
    });

    expect(spec.HostConfig.Tmpfs).toBeDefined();
    expect(spec.HostConfig.Tmpfs).toHaveProperty("/tmp");
  });

  it("passes servername as Cmd args, not in entrypoint", () => {
    const factory = createDockerContainerFactory(fakeDockerClient(), fakeVolumeManager());
    const spec = factory.buildContainerSpec({
      serverName: "myserver",
      rconPassword: "secret123",
    });

    expect(spec.Cmd).toContain("-servername");
    expect(spec.Cmd).toContain("myserver");
    // Entrypoint ends with exec ... "$@" which receives Cmd as args
  });

  it("uses default image and ports", () => {
    const factory = createDockerContainerFactory(fakeDockerClient(), fakeVolumeManager());
    const spec = factory.buildContainerSpec({
      serverName: "test",
      rconPassword: "secret123",
    });

    expect(spec.Image).toBe("eclipse-temurin:21-jre");
    expect(spec.HostConfig.PortBindings["16261/udp"]).toBeDefined();
    expect(spec.HostConfig.PortBindings["27015/tcp"]).toBeDefined();
  });

  it("uses custom image and ports when provided", () => {
    const factory = createDockerContainerFactory(fakeDockerClient(), fakeVolumeManager());
    const spec = factory.buildContainerSpec({
      serverName: "test",
      rconPassword: "secret123",
      image: "custom/pz:latest",
      gamePort: 16300,
      rconPort: 28000,
    });

    expect(spec.Image).toBe("custom/pz:latest");
    expect(spec.HostConfig.PortBindings["16300/udp"]).toBeDefined();
    expect(spec.HostConfig.PortBindings["28000/tcp"]).toBeDefined();
  });

  it("sets JVM memory args from config", () => {
    const factory = createDockerContainerFactory(fakeDockerClient(), fakeVolumeManager());
    const spec = factory.buildContainerSpec({
      serverName: "test",
      rconPassword: "secret123",
      minMemoryMb: 1024,
      maxMemoryMb: 8192,
    });

    const memEnv = spec.Env.find((e) => e.startsWith("PZ_SERVER_ARGS="));
    expect(memEnv).toContain("-Xms1024m");
    expect(memEnv).toContain("-Xmx8192m");
  });

  it("uses unless-stopped restart policy", () => {
    const factory = createDockerContainerFactory(fakeDockerClient(), fakeVolumeManager());
    const spec = factory.buildContainerSpec({
      serverName: "test",
      rconPassword: "secret123",
    });

    expect(spec.HostConfig.RestartPolicy).toEqual({ Name: "unless-stopped" });
  });
});

describe("createManagedServer", () => {
  it("creates volume, pulls image if needed, creates container", async () => {
    const docker = fakeDockerClient();
    docker.inspectImage.mockResolvedValue(null); // image not present
    const volumes = fakeVolumeManager();
    const factory = createDockerContainerFactory(docker, volumes);

    const result = await factory.createManagedServer({
      serverName: "test",
      rconPassword: "secret123",
    });

    expect(result.success).toBe(true);
    expect(result.containerId).toBe("ctr123");
    expect(volumes.ensureBaseVolume).toHaveBeenCalled();
    expect(volumes.createServerVolume).toHaveBeenCalledWith("test");
    expect(docker.pullImage).toHaveBeenCalled();
    expect(docker.createContainer).toHaveBeenCalled();
  });

  it("skips image pull when image already exists", async () => {
    const docker = fakeDockerClient();
    docker.inspectImage.mockResolvedValue({ Id: "existing" });
    const volumes = fakeVolumeManager();
    const factory = createDockerContainerFactory(docker, volumes);

    await factory.createManagedServer({
      serverName: "test",
      rconPassword: "secret123",
    });

    expect(docker.pullImage).not.toHaveBeenCalled();
  });
});
