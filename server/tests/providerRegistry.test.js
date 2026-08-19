import { describe, it, expect } from "vitest";
import { ProviderRegistry } from "../services/providers/ProviderRegistry.js";
import { createDefaultRegistry } from "../services/providers/defaultRegistry.js";
import { PROVIDERS } from "../utils/serverProvider.js";
import { NativeLifecycle } from "../services/lifecycle/NativeLifecycle.js";
import { DockerLifecycle } from "../services/lifecycle/DockerLifecycle.js";
import { LocalFiles } from "../services/fileAccess/LocalFiles.js";
import { ContainerSteamCmdInstaller } from "../services/installer/ContainerSteamCmdInstaller.js";

// ── ProviderRegistry (generic) ──────────────────────────────────────────

describe("ProviderRegistry", () => {
  it("registers and retrieves entries", () => {
    const registry = new ProviderRegistry();
    const entry = { capabilities: [], create: () => ({}) };

    registry.register("fake-type", entry);

    expect(registry.get("fake-type")).toBe(entry);
  });

  it("get() returns null for an unregistered type", () => {
    const registry = new ProviderRegistry();

    expect(registry.get("nope")).toBeNull();
  });

  it("has() returns true for a registered type, false otherwise", () => {
    const registry = new ProviderRegistry();
    registry.register("fake-type", { capabilities: [], create: () => ({}) });

    expect(registry.has("fake-type")).toBe(true);
    expect(registry.has("nope")).toBe(false);
  });

  it("types() returns all registered type names", () => {
    const registry = new ProviderRegistry();
    registry.register("a", { capabilities: [], create: () => ({}) });
    registry.register("b", { capabilities: [], create: () => ({}) });

    expect(registry.types().sort()).toEqual(["a", "b"]);
  });

  it("createCapabilities() returns a null composition for an unknown type", () => {
    const registry = new ProviderRegistry();

    const caps = registry.createCapabilities("nope", {}, {});

    expect(caps).toEqual({ lifecycle: null, files: null, installer: null });
  });

  it("createCapabilities() delegates to the entry's create()", () => {
    const registry = new ProviderRegistry();
    const marker = { lifecycle: "L", files: "F", installer: "I" };
    registry.register("fake-type", { capabilities: [], create: () => marker });

    const caps = registry.createCapabilities("fake-type", {}, {});

    expect(caps).toBe(marker);
  });
});

// ── Default registry ─────────────────────────────────────────────────

describe("createDefaultRegistry", () => {
  it("registers all four provider types", () => {
    const registry = createDefaultRegistry();

    expect(registry.types().sort()).toEqual(
      [
        PROVIDERS.NATIVE,
        PROVIDERS.DOCKER_LOCAL,
        PROVIDERS.DOCKER_MANAGED,
        PROVIDERS.REMOTE_SFTP,
      ].sort(),
    );
  });

  describe("native", () => {
    it("creates NativeLifecycle + LocalFiles + installer when provided", () => {
      const registry = createDefaultRegistry();
      const nativeInstaller = { name: "fake-native-installer" };

      const caps = registry.createCapabilities(PROVIDERS.NATIVE, { nativeInstaller }, {});

      expect(caps.lifecycle).toBeInstanceOf(NativeLifecycle);
      expect(caps.files).toBeInstanceOf(LocalFiles);
      expect(caps.installer).toBe(nativeInstaller);
    });

    it("creates a null installer when deps.nativeInstaller is not provided", () => {
      const registry = createDefaultRegistry();

      const caps = registry.createCapabilities(PROVIDERS.NATIVE, {}, {});

      expect(caps.lifecycle).toBeInstanceOf(NativeLifecycle);
      expect(caps.files).toBeInstanceOf(LocalFiles);
      expect(caps.installer).toBeNull();
    });
  });

  describe("docker-local", () => {
    it("creates null lifecycle, LocalFiles, and null installer", () => {
      const registry = createDefaultRegistry();

      const caps = registry.createCapabilities(PROVIDERS.DOCKER_LOCAL, {}, {});

      expect(caps.lifecycle).toBeNull();
      expect(caps.files).toBeInstanceOf(LocalFiles);
      expect(caps.installer).toBeNull();
    });
  });

  describe("docker-managed", () => {
    it("creates DockerLifecycle + LocalFiles + ContainerSteamCmdInstaller when dockerClient available", () => {
      const registry = createDefaultRegistry();
      const deps = { dockerClient: { available: true } };
      const cfg = { dockerContainerId: "abc123" };

      const caps = registry.createCapabilities(PROVIDERS.DOCKER_MANAGED, deps, cfg);

      expect(caps.lifecycle).toBeInstanceOf(DockerLifecycle);
      expect(caps.files).toBeInstanceOf(LocalFiles);
      expect(caps.installer).toBeInstanceOf(ContainerSteamCmdInstaller);
    });

    it("creates null lifecycle and installer when no dockerClient", () => {
      const registry = createDefaultRegistry();

      const caps = registry.createCapabilities(PROVIDERS.DOCKER_MANAGED, {}, {});

      expect(caps.lifecycle).toBeNull();
      expect(caps.files).toBeInstanceOf(LocalFiles);
      expect(caps.installer).toBeNull();
    });
  });

  describe("remote-sftp", () => {
    it("creates all null capabilities", () => {
      const registry = createDefaultRegistry();

      const caps = registry.createCapabilities(PROVIDERS.REMOTE_SFTP, {}, {});

      expect(caps).toEqual({ lifecycle: null, files: null, installer: null });
    });
  });
});
