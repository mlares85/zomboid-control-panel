import { beforeEach, describe, expect, it } from "vitest";
import { createDockerVolumeManager, serverVolumeName } from "../services/dockerVolumeManager.js";

function createFakeDockerClient() {
  const volumes = new Map();
  return {
    volumes,
    async createVolume(name) {
      if (volumes.has(name)) return { success: true, data: volumes.get(name) };
      const vol = { Name: name, Mountpoint: `/var/lib/docker/volumes/${name}/_data` };
      volumes.set(name, vol);
      return { success: true, data: vol };
    },
    async inspectVolume(name) {
      return volumes.get(name) || null;
    },
    async removeVolume(name) {
      if (!volumes.has(name)) return { success: false, error: "no such volume" };
      volumes.delete(name);
      return { success: true };
    },
    async _requestJson(method, path) {
      if (method === "GET" && path === "/volumes") {
        return { success: true, data: { Volumes: [...volumes.values()] } };
      }
      return { success: false };
    },
  };
}

describe("serverVolumeName", () => {
  it("prefixes server names with zomboid-srv-", () => {
    expect(serverVolumeName("my-server")).toBe("zomboid-srv-my-server");
  });
});

describe("dockerVolumeManager", () => {
  let fakeClient;
  let manager;

  beforeEach(() => {
    fakeClient = createFakeDockerClient();
    manager = createDockerVolumeManager(fakeClient);
  });

  describe("getBaseVolumeStatus", () => {
    it("returns exists:false when base volume does not exist", async () => {
      const status = await manager.getBaseVolumeStatus();
      expect(status).toEqual({ exists: false, populated: false });
    });

    it("returns exists:true with mountpoint when base volume exists", async () => {
      await fakeClient.createVolume("zomboid-panel-base");
      const status = await manager.getBaseVolumeStatus();
      expect(status.exists).toBe(true);
      expect(status.populated).toBe(true);
      expect(status.mountpoint).toContain("zomboid-panel-base");
    });
  });

  describe("ensureBaseVolume", () => {
    it("creates the base volume when it does not exist", async () => {
      const result = await manager.ensureBaseVolume();
      expect(result).toEqual({ success: true, created: true });
      expect(fakeClient.volumes.has("zomboid-panel-base")).toBe(true);
    });

    it("skips creation when the base volume already exists", async () => {
      await fakeClient.createVolume("zomboid-panel-base");
      const result = await manager.ensureBaseVolume();
      expect(result).toEqual({ success: true, created: false });
    });
  });

  describe("createServerVolume", () => {
    it("creates a volume with the correct naming convention", async () => {
      const result = await manager.createServerVolume("alpha");
      expect(result).toEqual({ success: true, volumeName: "zomboid-srv-alpha" });
      expect(fakeClient.volumes.has("zomboid-srv-alpha")).toBe(true);
    });
  });

  describe("removeServerVolume", () => {
    it("removes the correct server volume", async () => {
      await fakeClient.createVolume("zomboid-srv-beta");
      const result = await manager.removeServerVolume("beta");
      expect(result.success).toBe(true);
      expect(fakeClient.volumes.has("zomboid-srv-beta")).toBe(false);
    });

    it("returns failure when the volume does not exist", async () => {
      const result = await manager.removeServerVolume("nonexistent");
      expect(result.success).toBe(false);
    });
  });

  describe("listManagedVolumes", () => {
    it("returns null base when no base volume exists", async () => {
      const result = await manager.listManagedVolumes();
      expect(result.base).toBeNull();
      expect(result.servers).toEqual([]);
    });

    it("returns base volume info when it exists", async () => {
      await fakeClient.createVolume("zomboid-panel-base");
      const result = await manager.listManagedVolumes();
      expect(result.base.name).toBe("zomboid-panel-base");
      expect(result.base.mountpoint).toBeDefined();
    });

    it("lists per-server volumes with parsed serverName", async () => {
      await manager.createServerVolume("alpha");
      await manager.createServerVolume("beta");
      await fakeClient.createVolume("unrelated-vol");
      const result = await manager.listManagedVolumes();
      expect(result.servers).toHaveLength(2);
      expect(result.servers.map((s) => s.serverName).sort()).toEqual(["alpha", "beta"]);
    });
  });
});
