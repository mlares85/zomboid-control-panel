import { describe, it, expect, vi, beforeEach } from "vitest";
import { Installer } from "../services/installer/Installer.js";
import { NativeSteamCmdInstaller } from "../services/installer/NativeSteamCmdInstaller.js";

// ── Abstract base tests ──────────────────────────────────────────────

describe("Installer (abstract)", () => {
  it("throws when instantiated directly", () => {
    expect(() => new Installer()).toThrow("abstract");
  });

  it("subclass can be instantiated", () => {
    class TestInstaller extends Installer {
      constructor() { super("TestInstaller"); }
    }
    expect(new TestInstaller()).toBeInstanceOf(Installer);
  });

  it("unimplemented methods throw 'not implemented'", async () => {
    class TestInstaller extends Installer {
      constructor() { super("TestInstaller"); }
    }
    const inst = new TestInstaller();
    await expect(inst.isAvailable()).rejects.toThrow("not implemented");
    await expect(inst.install({})).rejects.toThrow("not implemented");
    await expect(inst.update({})).rejects.toThrow("not implemented");
  });
});

// ── NativeSteamCmdInstaller ──────────────────────────────────────────

function makeFakeDeps(overrides = {}) {
  const activeOps = new Map();
  return {
    steamCmd: {
      getExe: vi.fn((p) => `${p}/steamcmd.sh`),
      ensureLinux: vi.fn(async (p) => `${p}/steamcmd.sh`),
      hasActiveOp: vi.fn((p) => activeOps.has(p)),
      activeOps,
      getBetaArgs: vi.fn((branch) =>
        !branch || branch === "public" ? [] : ["-beta", branch],
      ),
      getLoginArgs: vi.fn(async () => ["+login", "anonymous"]),
      attachStreaming: vi.fn(() => ({
        getOutput: () => "",
        flush: () => {},
      })),
      recoverManifest: vi.fn(() => null),
      ...overrides.steamCmd,
    },
    isWindows: overrides.isWindows ?? false,
  };
}

// Fake spawn: creates an EventEmitter-like child process
function fakeSpawn(exitCode = 0) {
  const handlers = {};
  const child = {
    pid: 12345,
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event, handler) => { handlers[event] = handler; }),
    _emit: (event, ...args) => handlers[event]?.(...args),
  };
  // Auto-emit close after tick to simulate process exit
  setTimeout(() => handlers.close?.(exitCode), 0);
  return child;
}

// Spy on spawn
let spawnMock;
vi.mock("child_process", () => ({
  spawn: (...args) => spawnMock(...args),
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => true),
    },
    existsSync: vi.fn(() => true),
  };
});

import fs from "fs";

describe("NativeSteamCmdInstaller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock = vi.fn(() => fakeSpawn(0));
    fs.existsSync.mockReturnValue(true);
  });

  describe("isAvailable", () => {
    it("returns available when SteamCMD exe exists", async () => {
      const deps = makeFakeDeps();
      const installer = new NativeSteamCmdInstaller(deps);

      const result = await installer.isAvailable();
      expect(result.available).toBe(true);
    });

    it("returns available on Linux even without existing exe (can auto-download)", async () => {
      fs.existsSync.mockReturnValue(false);
      const deps = makeFakeDeps({ isWindows: false });
      const installer = new NativeSteamCmdInstaller(deps);

      const result = await installer.isAvailable();
      expect(result.available).toBe(true);
      expect(result.reason).toMatch(/auto-download/);
    });

    it("returns unavailable on Windows when exe missing", async () => {
      fs.existsSync.mockReturnValue(false);
      const deps = makeFakeDeps({ isWindows: true });
      const installer = new NativeSteamCmdInstaller(deps);

      const result = await installer.isAvailable();
      expect(result.available).toBe(false);
    });
  });

  describe("install", () => {
    it("spawns SteamCMD with correct args for public branch", async () => {
      const deps = makeFakeDeps();
      const installer = new NativeSteamCmdInstaller(deps);
      const onProgress = vi.fn();

      const result = await installer.install({
        steamcmdPath: "/opt/steamcmd",
        installPath: "/opt/pz-server",
        branch: "public",
        onProgress,
      });

      expect(result.success).toBe(true);
      expect(spawnMock).toHaveBeenCalledOnce();

      const [exe, args] = spawnMock.mock.calls[0];
      expect(exe).toBe("/opt/steamcmd/steamcmd.sh");
      expect(args).toContain("+force_install_dir");
      expect(args).toContain("/opt/pz-server");
      expect(args).toContain("+app_update");
      expect(args).toContain("380870");
      expect(args).toContain("validate");
      expect(args).toContain("+quit");
    });

    it("includes beta args for non-public branch", async () => {
      const deps = makeFakeDeps();
      const installer = new NativeSteamCmdInstaller(deps);

      await installer.install({
        steamcmdPath: "/opt/steamcmd",
        installPath: "/opt/pz-server",
        branch: "unstable",
        onProgress: vi.fn(),
      });

      const [, args] = spawnMock.mock.calls[0];
      expect(args).toContain("-beta");
      expect(args).toContain("unstable");
    });

    it("returns error when SteamCMD exe missing on Windows", async () => {
      fs.existsSync.mockReturnValue(false);
      const deps = makeFakeDeps({ isWindows: true });
      const installer = new NativeSteamCmdInstaller(deps);

      const result = await installer.install({
        steamcmdPath: "/opt/steamcmd",
        installPath: "/opt/pz-server",
        onProgress: vi.fn(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/);
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it("auto-downloads SteamCMD on Linux when missing", async () => {
      // First call checks if exe exists (false), rest return true
      fs.existsSync.mockReturnValueOnce(false).mockReturnValue(true);
      const deps = makeFakeDeps();
      const installer = new NativeSteamCmdInstaller(deps);

      const result = await installer.install({
        steamcmdPath: "/opt/steamcmd",
        installPath: "/opt/pz-server",
        onProgress: vi.fn(),
      });

      expect(result.success).toBe(true);
      expect(deps.steamCmd.ensureLinux).toHaveBeenCalledWith("/opt/steamcmd");
    });

    it("prevents concurrent operations on same path", async () => {
      const deps = makeFakeDeps();
      deps.steamCmd.activeOps.set("/opt/pz-server", { type: "install" });
      deps.steamCmd.hasActiveOp.mockReturnValue(true);
      const installer = new NativeSteamCmdInstaller(deps);

      const result = await installer.install({
        steamcmdPath: "/opt/steamcmd",
        installPath: "/opt/pz-server",
        onProgress: vi.fn(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/already in progress/);
    });

    it("clears active operation on success", async () => {
      const deps = makeFakeDeps();
      const installer = new NativeSteamCmdInstaller(deps);

      await installer.install({
        steamcmdPath: "/opt/steamcmd",
        installPath: "/opt/pz-server",
        onProgress: vi.fn(),
      });

      expect(deps.steamCmd.activeOps.size).toBe(0);
    });

    it("clears active operation on failure", async () => {
      spawnMock = vi.fn(() => fakeSpawn(1));
      const deps = makeFakeDeps();
      const installer = new NativeSteamCmdInstaller(deps);

      await installer.install({
        steamcmdPath: "/opt/steamcmd",
        installPath: "/opt/pz-server",
        onProgress: vi.fn(),
      });

      expect(deps.steamCmd.activeOps.size).toBe(0);
    });

    it("emits progress events", async () => {
      const deps = makeFakeDeps();
      const installer = new NativeSteamCmdInstaller(deps);
      const events = [];
      const onProgress = (event, data) => events.push({ event, data });

      await installer.install({
        steamcmdPath: "/opt/steamcmd",
        installPath: "/opt/pz-server",
        onProgress,
      });

      expect(events.some(e => e.event === "start")).toBe(true);
      expect(events.some(e => e.event === "complete")).toBe(true);
    });

    it("treats SteamCMD exit code 7 as success (Windows thread-pool race)", async () => {
      spawnMock = vi.fn(() => fakeSpawn(7));
      const deps = makeFakeDeps();
      const installer = new NativeSteamCmdInstaller(deps);

      const result = await installer.install({
        steamcmdPath: "/opt/steamcmd",
        installPath: "/opt/pz-server",
        onProgress: vi.fn(),
      });

      expect(result.success).toBe(true);
    });

    it("returns {success: false} on non-zero exit — never throws", async () => {
      spawnMock = vi.fn(() => fakeSpawn(1));
      const deps = makeFakeDeps();
      const installer = new NativeSteamCmdInstaller(deps);

      const result = await installer.install({
        steamcmdPath: "/opt/steamcmd",
        installPath: "/opt/pz-server",
        onProgress: vi.fn(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/exit code 1/);
    });

    it("handles spawn error — never throws", async () => {
      spawnMock = vi.fn(() => {
        const child = fakeSpawn(0);
        // Override to emit error instead of close
        child.on = vi.fn((event, handler) => {
          if (event === "error") setTimeout(() => handler(new Error("ENOENT")), 0);
        });
        return child;
      });
      const deps = makeFakeDeps();
      const installer = new NativeSteamCmdInstaller(deps);

      const result = await installer.install({
        steamcmdPath: "/opt/steamcmd",
        installPath: "/opt/pz-server",
        onProgress: vi.fn(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/ENOENT/);
    });

    it("sets LD_LIBRARY_PATH on Linux", async () => {
      const deps = makeFakeDeps({ isWindows: false });
      const installer = new NativeSteamCmdInstaller(deps);

      await installer.install({
        steamcmdPath: "/opt/steamcmd",
        installPath: "/opt/pz-server",
        onProgress: vi.fn(),
      });

      const [, , opts] = spawnMock.mock.calls[0];
      expect(opts.env.LD_LIBRARY_PATH).toContain("linux32");
      expect(opts.env.LD_LIBRARY_PATH).toContain("linux64");
    });

    it("does not set LD_LIBRARY_PATH on Windows", async () => {
      const deps = makeFakeDeps({ isWindows: true });
      const installer = new NativeSteamCmdInstaller(deps);

      await installer.install({
        steamcmdPath: "C:\\steamcmd",
        installPath: "C:\\pz-server",
        onProgress: vi.fn(),
      });

      const [, , opts] = spawnMock.mock.calls[0];
      expect(opts.env).toBeUndefined();
    });

    it("tolerates null onProgress", async () => {
      const deps = makeFakeDeps();
      const installer = new NativeSteamCmdInstaller(deps);

      const result = await installer.install({
        steamcmdPath: "/opt/steamcmd",
        installPath: "/opt/pz-server",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("update", () => {
    it("spawns SteamCMD for update operation", async () => {
      const deps = makeFakeDeps();
      const installer = new NativeSteamCmdInstaller(deps);

      const result = await installer.update({
        steamcmdPath: "/opt/steamcmd",
        installPath: "/opt/pz-server",
        branch: "public",
        onProgress: vi.fn(),
      });

      expect(result.success).toBe(true);
      expect(spawnMock).toHaveBeenCalledOnce();
    });

    it("calls recoverManifest before update", async () => {
      const deps = makeFakeDeps();
      const installer = new NativeSteamCmdInstaller(deps);

      await installer.update({
        steamcmdPath: "/opt/steamcmd",
        installPath: "/opt/pz-server",
        branch: "unstable",
        onProgress: vi.fn(),
      });

      expect(deps.steamCmd.recoverManifest).toHaveBeenCalledWith(
        "/opt/pz-server",
        "unstable",
      );
    });

    it("detects Steam depot access denied", async () => {
      const deps = makeFakeDeps({
        steamCmd: {
          attachStreaming: vi.fn(() => ({
            getOutput: () => 'app "380870" state is 0x6 after update job',
            flush: () => {},
          })),
        },
      });
      spawnMock = vi.fn(() => fakeSpawn(1));
      const installer = new NativeSteamCmdInstaller(deps);

      const result = await installer.update({
        steamcmdPath: "/opt/steamcmd",
        installPath: "/opt/pz-server",
        onProgress: vi.fn(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/depot manifest/);
    });

    it("prevents concurrent operations", async () => {
      const deps = makeFakeDeps();
      deps.steamCmd.activeOps.set("/opt/pz-server", { type: "update" });
      deps.steamCmd.hasActiveOp.mockReturnValue(true);
      const installer = new NativeSteamCmdInstaller(deps);

      const result = await installer.update({
        steamcmdPath: "/opt/steamcmd",
        installPath: "/opt/pz-server",
        onProgress: vi.fn(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/already in progress/);
    });
  });
});
