import { describe, it, expect, vi } from "vitest";
import { Lifecycle } from "../services/lifecycle/Lifecycle.js";
import { DockerLifecycle } from "../services/lifecycle/DockerLifecycle.js";

// ── Abstract base tests ──────────────────────────────────────────────

describe("Lifecycle (abstract)", () => {
  it("throws when instantiated directly", () => {
    expect(() => new Lifecycle()).toThrow("abstract");
  });

  it("subclass can be instantiated", () => {
    class TestLifecycle extends Lifecycle {
      constructor() { super("TestLifecycle"); }
    }
    expect(new TestLifecycle()).toBeInstanceOf(Lifecycle);
  });

  it("unimplemented methods throw 'not implemented'", async () => {
    class TestLifecycle extends Lifecycle {
      constructor() { super("TestLifecycle"); }
    }
    const life = new TestLifecycle();
    await expect(life.launch()).rejects.toThrow("not implemented");
    await expect(life.terminate()).rejects.toThrow("not implemented");
    await expect(life.isRunning()).rejects.toThrow("not implemented");
  });
});

// ── DockerLifecycle ──────────────────────────────────────────────────

function makeFakeDocker(overrides = {}) {
  return {
    available: true,
    isContainerRunning: vi.fn(async () => false),
    startContainer: vi.fn(async () => ({ success: true })),
    stopContainer: vi.fn(async () => ({ success: true })),
    ...overrides,
  };
}

describe("DockerLifecycle.launch", () => {
  it("starts the container when not running", async () => {
    const dockerClient = makeFakeDocker();
    const life = new DockerLifecycle({ dockerClient, containerRef: "pz-container" });

    const result = await life.launch();

    expect(result).toEqual({ success: true, message: "Docker container started" });
    expect(dockerClient.startContainer).toHaveBeenCalledWith("pz-container");
  });

  it("returns an error when already running", async () => {
    const dockerClient = makeFakeDocker({ isContainerRunning: vi.fn(async () => true) });
    const life = new DockerLifecycle({ dockerClient, containerRef: "pz-container" });

    const result = await life.launch();

    expect(result).toEqual({ success: false, error: "Server is already running" });
    expect(dockerClient.startContainer).not.toHaveBeenCalled();
  });

  it("returns an error when Docker is unavailable", async () => {
    const dockerClient = makeFakeDocker({ available: false });
    const life = new DockerLifecycle({ dockerClient, containerRef: "pz-container" });

    const result = await life.launch();

    expect(result).toEqual({ success: false, error: "Docker client not available" });
  });

  it("returns an error when no container ref is configured", async () => {
    const dockerClient = makeFakeDocker();
    const life = new DockerLifecycle({ dockerClient, containerRef: null });

    const result = await life.launch();

    expect(result).toEqual({ success: false, error: "No container reference configured" });
  });

  it("returns {success: false} on Docker API failure, never throws", async () => {
    const dockerClient = makeFakeDocker({
      startContainer: vi.fn(async () => ({ success: false, error: "boom" })),
    });
    const life = new DockerLifecycle({ dockerClient, containerRef: "pz-container" });

    const result = await life.launch();

    expect(result).toEqual({ success: false, error: "boom" });
  });

  it("returns {success: false} when the Docker client throws", async () => {
    const dockerClient = makeFakeDocker({
      isContainerRunning: vi.fn(async () => { throw new Error("socket error"); }),
    });
    const life = new DockerLifecycle({ dockerClient, containerRef: "pz-container" });

    const result = await life.launch();

    expect(result).toEqual({ success: false, error: "socket error" });
  });
});

describe("DockerLifecycle.terminate", () => {
  it("stops the container", async () => {
    const dockerClient = makeFakeDocker();
    const life = new DockerLifecycle({ dockerClient, containerRef: "pz-container" });

    const result = await life.terminate();

    expect(result).toEqual({ success: true, message: "Docker container stopped" });
    expect(dockerClient.stopContainer).toHaveBeenCalledWith("pz-container");
  });

  it("returns an error when Docker is unavailable", async () => {
    const dockerClient = makeFakeDocker({ available: false });
    const life = new DockerLifecycle({ dockerClient, containerRef: "pz-container" });

    const result = await life.terminate();

    expect(result).toEqual({ success: false, error: "Docker client not available" });
  });

  it("returns {success: false} on Docker API failure, never throws", async () => {
    const dockerClient = makeFakeDocker({
      stopContainer: vi.fn(async () => ({ success: false, error: "boom" })),
    });
    const life = new DockerLifecycle({ dockerClient, containerRef: "pz-container" });

    const result = await life.terminate();

    expect(result).toEqual({ success: false, error: "boom" });
  });

  it("returns {success: false} when the Docker client throws", async () => {
    const dockerClient = makeFakeDocker({
      stopContainer: vi.fn(async () => { throw new Error("socket error"); }),
    });
    const life = new DockerLifecycle({ dockerClient, containerRef: "pz-container" });

    const result = await life.terminate();

    expect(result).toEqual({ success: false, error: "socket error" });
  });
});

describe("DockerLifecycle.isRunning", () => {
  it("returns true when the container is running", async () => {
    const dockerClient = makeFakeDocker({ isContainerRunning: vi.fn(async () => true) });
    const life = new DockerLifecycle({ dockerClient, containerRef: "pz-container" });

    expect(await life.isRunning()).toBe(true);
  });

  it("returns false when the container is not running", async () => {
    const dockerClient = makeFakeDocker({ isContainerRunning: vi.fn(async () => false) });
    const life = new DockerLifecycle({ dockerClient, containerRef: "pz-container" });

    expect(await life.isRunning()).toBe(false);
  });

  it("returns false when Docker is unavailable, never throws", async () => {
    const dockerClient = makeFakeDocker({ available: false });
    const life = new DockerLifecycle({ dockerClient, containerRef: "pz-container" });

    expect(await life.isRunning()).toBe(false);
  });

  it("returns false when the Docker client throws", async () => {
    const dockerClient = makeFakeDocker({
      isContainerRunning: vi.fn(async () => { throw new Error("socket error"); }),
    });
    const life = new DockerLifecycle({ dockerClient, containerRef: "pz-container" });

    expect(await life.isRunning()).toBe(false);
  });
});
