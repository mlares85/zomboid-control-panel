import { describe, expect, it } from "vitest";
import { buildPlatformGuidance } from "../services/platformGuidance.js";

describe("buildPlatformGuidance", () => {
  it("macOS with Docker detected: can run in a container, no recommendations", () => {
    const guidance = buildPlatformGuidance({ platform: "darwin", dockerRuntime: "orbstack" });

    expect(guidance).toEqual({
      platform: "darwin",
      canRunNative: false,
      canRunDocker: true,
      dockerRuntime: "orbstack",
      recommendations: [],
    });
  });

  it("macOS without Docker: recommends OrbStack and Docker Desktop", () => {
    const guidance = buildPlatformGuidance({ platform: "darwin", dockerRuntime: null });

    expect(guidance.canRunNative).toBe(false);
    expect(guidance.canRunDocker).toBe(false);
    expect(guidance.dockerRuntime).toBeNull();
    expect(guidance.recommendations.map((r) => r.type)).toEqual([
      "install-docker",
      "install-docker",
    ]);
    expect(guidance.recommendations.map((r) => r.label)).toEqual([
      "Install OrbStack",
      "Install Docker Desktop",
    ]);
    for (const rec of guidance.recommendations) {
      expect(rec.url).toMatch(/^https:\/\//);
      expect(rec.description).toBeTruthy();
    }
  });

  it("Windows without Docker: can run natively, no docker recommendations", () => {
    const guidance = buildPlatformGuidance({ platform: "win32", dockerRuntime: null });

    expect(guidance).toEqual({
      platform: "win32",
      canRunNative: true,
      canRunDocker: false,
      dockerRuntime: null,
      recommendations: [],
    });
  });

  it("Windows with Docker Desktop: both native and docker available", () => {
    const guidance = buildPlatformGuidance({ platform: "win32", dockerRuntime: "docker-desktop" });

    expect(guidance).toEqual({
      platform: "win32",
      canRunNative: true,
      canRunDocker: true,
      dockerRuntime: "docker-desktop",
      recommendations: [],
    });
  });

  it("Linux with Docker: both native and docker available, no recommendations", () => {
    const guidance = buildPlatformGuidance({ platform: "linux", dockerRuntime: "native" });

    expect(guidance).toEqual({
      platform: "linux",
      canRunNative: true,
      canRunDocker: true,
      dockerRuntime: "native",
      recommendations: [],
    });
  });

  it("Linux without Docker: native only, no docker recommendations", () => {
    const guidance = buildPlatformGuidance({ platform: "linux", dockerRuntime: null });

    expect(guidance).toEqual({
      platform: "linux",
      canRunNative: true,
      canRunDocker: false,
      dockerRuntime: null,
      recommendations: [],
    });
  });
});
