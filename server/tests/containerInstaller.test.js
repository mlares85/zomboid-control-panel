import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContainerSteamCmdInstaller } from "../services/installer/ContainerSteamCmdInstaller.js";
import { Installer } from "../services/installer/Installer.js";

function makeFakeDocker(overrides = {}) {
  return {
    info: vi.fn(async () => ({ ID: "fake" })),
    inspectVolume: vi.fn(async () => null),
    createVolume: vi.fn(async () => ({ Name: "test-vol" })),
    pullImage: vi.fn(async () => ({ success: true })),
    createContainer: vi.fn(async () => ({ success: true, id: "abc123" })),
    startContainer: vi.fn(async () => ({ success: true })),
    inspectContainer: vi.fn(async () => ({ State: { Running: false, ExitCode: 0 } })),
    getContainerLogs: vi.fn(async () => ({ success: true, lines: ["done"] })),
    removeContainer: vi.fn(async () => ({ success: true })),
    ...overrides,
  };
}

describe("ContainerSteamCmdInstaller", () => {
  beforeEach(() => vi.clearAllMocks());

  it("extends Installer", () => {
    const installer = new ContainerSteamCmdInstaller({ dockerClient: makeFakeDocker() });
    expect(installer).toBeInstanceOf(Installer);
  });

  describe("isAvailable", () => {
    it("returns available when Docker responds", async () => {
      const installer = new ContainerSteamCmdInstaller({ dockerClient: makeFakeDocker() });
      const result = await installer.isAvailable();
      expect(result.available).toBe(true);
    });

    it("returns unavailable without a Docker client", async () => {
      const installer = new ContainerSteamCmdInstaller({ dockerClient: null });
      const result = await installer.isAvailable();
      expect(result.available).toBe(false);
    });

    it("returns unavailable when Docker daemon errors", async () => {
      const docker = makeFakeDocker({ info: vi.fn(async () => { throw new Error("connection refused"); }) });
      const installer = new ContainerSteamCmdInstaller({ dockerClient: docker });
      const result = await installer.isAvailable();
      expect(result.available).toBe(false);
      expect(result.reason).toMatch(/connection refused/);
    });
  });

  describe("install", () => {
    it("pulls image, creates container, and resolves on exit 0", async () => {
      const docker = makeFakeDocker();
      const installer = new ContainerSteamCmdInstaller({ dockerClient: docker });

      const result = await installer.install({
        volumeName: "test-vol",
        onProgress: vi.fn(),
      });

      expect(result.success).toBe(true);
      expect(docker.pullImage).toHaveBeenCalledWith("steamcmd/steamcmd", "latest");
      expect(docker.createContainer).toHaveBeenCalledOnce();
      expect(docker.startContainer).toHaveBeenCalledWith("abc123");
      expect(docker.removeContainer).toHaveBeenCalledWith("abc123", true);
    });

    it("creates volume if it does not exist", async () => {
      const docker = makeFakeDocker({ inspectVolume: vi.fn(async () => null) });
      const installer = new ContainerSteamCmdInstaller({ dockerClient: docker });

      await installer.install({ volumeName: "new-vol", onProgress: vi.fn() });

      expect(docker.createVolume).toHaveBeenCalledWith("new-vol");
    });

    it("skips volume creation if it already exists", async () => {
      const docker = makeFakeDocker({ inspectVolume: vi.fn(async () => ({ Name: "existing" })) });
      const installer = new ContainerSteamCmdInstaller({ dockerClient: docker });

      await installer.install({ volumeName: "existing", onProgress: vi.fn() });

      expect(docker.createVolume).not.toHaveBeenCalled();
    });

    it("returns error when image pull fails", async () => {
      const docker = makeFakeDocker({
        pullImage: vi.fn(async () => ({ success: false, error: "network error" })),
      });
      const installer = new ContainerSteamCmdInstaller({ dockerClient: docker });

      const result = await installer.install({ volumeName: "v", onProgress: vi.fn() });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/pull.*image/i);
    });

    it("returns error when container creation fails", async () => {
      const docker = makeFakeDocker({
        createContainer: vi.fn(async () => ({ success: false, error: "oom" })),
      });
      const installer = new ContainerSteamCmdInstaller({ dockerClient: docker });

      const result = await installer.install({ volumeName: "v", onProgress: vi.fn() });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/create container/i);
    });

    it("cleans up container when start fails", async () => {
      const docker = makeFakeDocker({
        startContainer: vi.fn(async () => ({ success: false, error: "port conflict" })),
      });
      const installer = new ContainerSteamCmdInstaller({ dockerClient: docker });

      const result = await installer.install({ volumeName: "v", onProgress: vi.fn() });

      expect(result.success).toBe(false);
      expect(docker.removeContainer).toHaveBeenCalledWith("abc123", true);
    });

    it("returns error on non-zero exit code", async () => {
      const docker = makeFakeDocker({
        inspectContainer: vi.fn(async () => ({ State: { Running: false, ExitCode: 7 } })),
      });
      const installer = new ContainerSteamCmdInstaller({ dockerClient: docker });

      const result = await installer.install({ volumeName: "v", onProgress: vi.fn() });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/exit.*code.*7/);
    });

    it("emits progress events", async () => {
      const docker = makeFakeDocker();
      const installer = new ContainerSteamCmdInstaller({ dockerClient: docker });
      const events = [];

      await installer.install({
        volumeName: "v",
        onProgress: (event, data) => events.push({ event, data }),
      });

      expect(events.some(e => e.event === "status")).toBe(true);
      expect(events.some(e => e.event === "start")).toBe(true);
      expect(events.some(e => e.event === "complete")).toBe(true);
    });

    it("emits log events for new container output lines", async () => {
      const docker = makeFakeDocker({
        getContainerLogs: vi.fn(async () => ({
          success: true,
          lines: ["Downloading...", "Progress 50%"],
        })),
      });
      const installer = new ContainerSteamCmdInstaller({ dockerClient: docker });
      const events = [];

      await installer.install({
        volumeName: "v",
        onProgress: (event, data) => events.push({ event, data }),
      });

      const logEvents = events.filter(e => e.event === "log");
      expect(logEvents.length).toBe(2);
      expect(logEvents[0].data.text).toBe("Downloading...");
      expect(logEvents[1].data.text).toBe("Progress 50%");
    });

    it("includes beta args for non-public branch", async () => {
      const docker = makeFakeDocker();
      const installer = new ContainerSteamCmdInstaller({ dockerClient: docker });

      await installer.install({
        volumeName: "v",
        branch: "unstable",
        onProgress: vi.fn(),
      });

      const [spec] = docker.createContainer.mock.calls[0];
      expect(spec.Cmd).toContain("-beta");
      expect(spec.Cmd).toContain("unstable");
    });

    it("omits beta args for public branch", async () => {
      const docker = makeFakeDocker();
      const installer = new ContainerSteamCmdInstaller({ dockerClient: docker });

      await installer.install({
        volumeName: "v",
        branch: "public",
        onProgress: vi.fn(),
      });

      const [spec] = docker.createContainer.mock.calls[0];
      expect(spec.Cmd).not.toContain("-beta");
    });

    it("returns error without Docker client", async () => {
      const installer = new ContainerSteamCmdInstaller({ dockerClient: null });
      const result = await installer.install({ volumeName: "v", onProgress: vi.fn() });
      expect(result.success).toBe(false);
    });

    it("tolerates null onProgress", async () => {
      const docker = makeFakeDocker();
      const installer = new ContainerSteamCmdInstaller({ dockerClient: docker });

      const result = await installer.install({ volumeName: "v" });
      expect(result.success).toBe(true);
    });
  });

  describe("update", () => {
    it("delegates to the same populate logic as install", async () => {
      const docker = makeFakeDocker();
      const installer = new ContainerSteamCmdInstaller({ dockerClient: docker });

      const result = await installer.update({
        volumeName: "v",
        onProgress: vi.fn(),
      });

      expect(result.success).toBe(true);
      expect(docker.createContainer).toHaveBeenCalledOnce();
    });
  });
});
