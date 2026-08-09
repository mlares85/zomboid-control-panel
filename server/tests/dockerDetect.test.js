import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";

import {
  isContainerized,
  getContainerInfo,
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
});
