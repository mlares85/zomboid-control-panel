import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import { execFileSync } from "child_process";

vi.mock("child_process", () => ({ execFileSync: vi.fn() }));

import {
  isContainerized,
  getContainerInfo,
  detectDockerRuntime,
} from "../utils/dockerDetect.js";

describe("dockerDetect", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("isContainerized returns false on non-linux platforms regardless of markers", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    vi.spyOn(fs, "existsSync").mockReturnValue(true);

    expect(isContainerized()).toBe(false);
  });

  it("isContainerized detects the .dockerenv marker on linux", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    vi.spyOn(fs, "existsSync").mockImplementation(
      (p) => p === "/.dockerenv",
    );

    expect(isContainerized()).toBe(true);
  });

  it("isContainerized returns false when neither marker exists", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    expect(isContainerized()).toBe(false);
  });

  it("getContainerInfo reports both containerized state and docker socket availability", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    vi.spyOn(fs, "existsSync").mockImplementation(
      (p) => p === "/.dockerenv" || p === "/var/run/docker.sock",
    );

    expect(getContainerInfo()).toEqual({
      containerized: true,
      hasDockerSocket: true,
    });
  });

  describe("detectDockerRuntime", () => {
    beforeEach(() => {
      execFileSync.mockReset();
    });

    it("returns 'orbstack' when the OrbStack CLI answers", () => {
      execFileSync.mockImplementation((cmd) => {
        if (cmd === "orbstack") return Buffer.from("1.5.0");
        throw new Error("should not be called");
      });

      expect(detectDockerRuntime()).toBe("orbstack");
    });

    it("returns 'docker-desktop' when `docker info` mentions Docker Desktop", () => {
      execFileSync.mockImplementation((cmd) => {
        if (cmd === "orbstack") throw new Error("ENOENT");
        if (cmd === "docker") return Buffer.from("Server Version: Docker Desktop 4.30");
        throw new Error("should not be called");
      });

      expect(detectDockerRuntime()).toBe("docker-desktop");
    });

    it("returns 'colima' when colima answers and docker info has no Docker Desktop marker", () => {
      execFileSync.mockImplementation((cmd) => {
        if (cmd === "orbstack") throw new Error("ENOENT");
        if (cmd === "docker") return Buffer.from("Server Version: 24.0.0");
        if (cmd === "colima") return Buffer.from("colima is running");
        throw new Error("should not be called");
      });

      expect(detectDockerRuntime()).toBe("colima");
    });

    it("returns 'native' when only the daemon answers `docker info`", () => {
      execFileSync.mockImplementation((cmd) => {
        if (cmd === "orbstack") throw new Error("ENOENT");
        if (cmd === "docker") return Buffer.from("Server Version: 24.0.0");
        if (cmd === "colima") throw new Error("ENOENT");
        throw new Error("should not be called");
      });

      expect(detectDockerRuntime()).toBe("native");
    });

    it("returns null when nothing answers", () => {
      execFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      expect(detectDockerRuntime()).toBeNull();
    });
  });
});
