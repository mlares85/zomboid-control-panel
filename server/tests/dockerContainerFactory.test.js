import { beforeEach, describe, expect, it } from "vitest";
import { createDockerContainerFactory } from "../services/dockerContainerFactory.js";

function createFakeDockerClient() {
  const containers = new Map();
  const images = new Map();
  const pullCalls = [];
  return {
    containers,
    images,
    pullCalls,
    async inspectImage(ref) {
      return images.get(ref) || null;
    },
    async pullImage(image, tag) {
      pullCalls.push({ image, tag });
      images.set(image, { Id: "sha256:abc" });
      return { success: true };
    },
    async createContainer(spec, name) {
      const id = `ctr-${containers.size + 1}`;
      containers.set(id, { spec, name });
      return { success: true, id };
    },
    async removeContainer(id) {
      if (!containers.has(id)) return { success: false, error: "no such container" };
      containers.delete(id);
      return { success: true };
    },
  };
}

function createFakeVolumeManager() {
  const volumes = new Set();
  return {
    volumes,
    async ensureBaseVolume() {
      volumes.add("zomboid-panel-base");
      return { success: true, created: !volumes.has("zomboid-panel-base") };
    },
    async createServerVolume(serverName) {
      const volumeName = `zomboid-srv-${serverName}`;
      volumes.add(volumeName);
      return { success: true, volumeName };
    },
  };
}

describe("dockerContainerFactory", () => {
  let fakeClient;
  let fakeVolManager;
  let factory;

  beforeEach(() => {
    fakeClient = createFakeDockerClient();
    fakeVolManager = createFakeVolumeManager();
    factory = createDockerContainerFactory(fakeClient, fakeVolManager);
  });

  describe("buildContainerSpec", () => {
    it("produces a Docker API spec with image, volumes, ports, labels, and env", () => {
      const spec = factory.buildContainerSpec({
        serverName: "test-srv",
        gamePort: 16261,
        rconPort: 27015,
        rconPassword: "secret123",
        minMemoryMb: 2048,
        maxMemoryMb: 4096,
      });

      expect(spec.Image).toBe("eclipse-temurin:21-jre");
      expect(spec.Labels["zomboid-panel.managed"]).toBe("true");
      expect(spec.Labels["zomboid-panel.server-id"]).toBe("test-srv");
      expect(spec.Env).toContain("RCON_PASSWORD=secret123");
      expect(spec.Env).toContain("GAME_PORT=16261");
      expect(spec.HostConfig.Binds).toContain("zomboid-panel-base:/opt/pz-server:ro");
      expect(spec.HostConfig.Binds).toContain("zomboid-srv-test-srv:/opt/pz-data");
      expect(spec.HostConfig.PortBindings["16261/udp"]).toEqual([{ HostPort: "16261" }]);
      expect(spec.HostConfig.PortBindings["27015/tcp"]).toEqual([{ HostPort: "27015" }]);
    });

    it("uses a custom image when provided", () => {
      const spec = factory.buildContainerSpec({
        serverName: "custom",
        rconPassword: "pw",
        image: "my-org/pz:latest",
      });
      expect(spec.Image).toBe("my-org/pz:latest");
    });

    it("falls back to default ports when not specified", () => {
      const spec = factory.buildContainerSpec({ serverName: "srv", rconPassword: "pw" });
      expect(spec.HostConfig.PortBindings["16261/udp"]).toBeDefined();
      expect(spec.HostConfig.PortBindings["27015/tcp"]).toBeDefined();
    });
  });

  describe("findAvailablePorts", () => {
    it("returns base ports when nothing is in use", () => {
      const ports = factory.findAvailablePorts([]);
      expect(ports).toEqual({ gamePort: 16261, rconPort: 27015 });
    });

    it("skips ports already used by existing servers", () => {
      const existing = [
        { gamePort: 16261, rconPort: 27015 },
        { gamePort: 16262, rconPort: 27016 },
      ];
      const ports = factory.findAvailablePorts(existing);
      expect(ports.gamePort).toBe(16263);
      expect(ports.rconPort).toBe(27017);
    });

    it("handles gaps in port assignments", () => {
      const existing = [{ gamePort: 16261, rconPort: 27016 }];
      const ports = factory.findAvailablePorts(existing);
      expect(ports.gamePort).toBe(16262);
      expect(ports.rconPort).toBe(27015);
    });
  });

  describe("createManagedServer", () => {
    it("orchestrates volume creation, image check, and container creation", async () => {
      const result = await factory.createManagedServer({
        serverName: "new-srv",
        rconPassword: "pw",
        gamePort: 16261,
        rconPort: 27015,
      });

      expect(result.success).toBe(true);
      expect(result.containerId).toBeDefined();
      expect(result.containerName).toBe("zomboid-new-srv");
      expect(fakeVolManager.volumes.has("zomboid-panel-base")).toBe(true);
      expect(fakeVolManager.volumes.has("zomboid-srv-new-srv")).toBe(true);
      expect(fakeClient.pullCalls.length).toBe(1);
    });

    it("skips image pull when the image already exists", async () => {
      fakeClient.images.set("eclipse-temurin:21-jre", { Id: "sha256:exists" });
      const result = await factory.createManagedServer({
        serverName: "cached",
        rconPassword: "pw",
      });

      expect(result.success).toBe(true);
      expect(fakeClient.pullCalls.length).toBe(0);
    });

    it("fails gracefully when base volume creation fails", async () => {
      fakeVolManager.ensureBaseVolume = async () => ({ success: false, created: false });
      const result = await factory.createManagedServer({
        serverName: "fail",
        rconPassword: "pw",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("base volume");
    });
  });

  describe("removeManagedServer", () => {
    it("removes the container", async () => {
      const createResult = await factory.createManagedServer({
        serverName: "doomed",
        rconPassword: "pw",
      });
      const removeResult = await factory.removeManagedServer(createResult.containerId);
      expect(removeResult.success).toBe(true);
      expect(fakeClient.containers.has(createResult.containerId)).toBe(false);
    });

    it("returns failure for a non-existent container", async () => {
      const result = await factory.removeManagedServer("nonexistent");
      expect(result.success).toBe(false);
    });
  });
});
