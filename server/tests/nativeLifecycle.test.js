import { describe, it, expect, vi } from "vitest";
import { NativeLifecycle } from "../services/lifecycle/NativeLifecycle.js";
import { Lifecycle } from "../services/lifecycle/Lifecycle.js";

function makeFakeFs(overrides = {}) {
  return {
    existsSync: vi.fn(() => true),
    openSync: vi.fn(() => 42),
    closeSync: vi.fn(),
    chmodSync: vi.fn(),
    ...overrides,
  };
}

function makeFakeChild(overrides = {}) {
  return {
    pid: 12345,
    on: vi.fn(),
    unref: vi.fn(),
    ...overrides,
  };
}

function makeLifecycle(overrides = {}) {
  const fs = makeFakeFs(overrides.fsOverrides);
  const spawn = overrides.spawn ?? vi.fn(() => makeFakeChild());
  const execFile = overrides.execFile ?? vi.fn((_cmd, _args, cb) => cb(null));
  const exec = overrides.exec ?? vi.fn((_cmd, cb) => cb(null));
  const life = new NativeLifecycle({
    isWindows: overrides.isWindows ?? false,
    spawn,
    execFile,
    exec,
    fs,
  });
  return { life, spawn, execFile, exec, fs };
}

// ── isRunning contract sanity (NativeLifecycle IS a Lifecycle) ──────────

describe("NativeLifecycle extends Lifecycle", () => {
  it("is an instance of the abstract base", () => {
    const { life } = makeLifecycle();
    expect(life).toBeInstanceOf(Lifecycle);
  });
});

// ── launch() ──────────────────────────────────────────────────────────

describe("NativeLifecycle.launch", () => {
  it("returns {success: true, pid} when spawn succeeds", async () => {
    const { life, spawn } = makeLifecycle();

    const result = await life.launch({ command: "/srv/start.sh", cwd: "/srv" });

    expect(result).toEqual({ success: true, pid: 12345, process: expect.any(Object) });
    expect(spawn).toHaveBeenCalledWith(
      "/srv/start.sh",
      [],
      expect.objectContaining({ cwd: "/srv", detached: true }),
    );
  });

  it("returns {success: false} when no command specified", async () => {
    const { life } = makeLifecycle();

    const result = await life.launch({});

    expect(result).toEqual({ success: false, error: "No command specified" });
  });

  it("returns {success: false} when command not found", async () => {
    const { life } = makeLifecycle({ fsOverrides: { existsSync: vi.fn(() => false) } });

    const result = await life.launch({ command: "/does/not/exist.sh" });

    expect(result).toEqual({ success: false, error: "Command not found: /does/not/exist.sh" });
  });

  it("allows system commands (bash, cmd.exe) even when not on disk", async () => {
    const { life, spawn } = makeLifecycle({ fsOverrides: { existsSync: vi.fn(() => false) } });

    const result = await life.launch({ command: "bash", args: ["start.sh"] });

    expect(result.success).toBe(true);
    expect(spawn).toHaveBeenCalled();
  });

  it("opens a log file when logPath is provided", async () => {
    const { life, fs, spawn } = makeLifecycle();

    await life.launch({ command: "/srv/start.sh", logPath: "/srv/logs/launch.log" });

    expect(fs.openSync).toHaveBeenCalledWith("/srv/logs/launch.log", "w");
    expect(spawn).toHaveBeenCalledWith(
      "/srv/start.sh",
      [],
      expect.objectContaining({ stdio: ["ignore", 42, 42] }),
    );
    expect(fs.closeSync).toHaveBeenCalledWith(42);
  });

  it("falls back to 'ignore' stdio when the log file can't be opened", async () => {
    const { life, spawn } = makeLifecycle({
      fsOverrides: {
        openSync: vi.fn(() => {
          throw new Error("EACCES");
        }),
      },
    });

    const result = await life.launch({ command: "/srv/start.sh", logPath: "/no/perms.log" });

    expect(result.success).toBe(true);
    expect(spawn).toHaveBeenCalledWith(
      "/srv/start.sh",
      [],
      expect.objectContaining({ stdio: ["ignore", "ignore", "ignore"] }),
    );
  });

  it("spawns detached and unrefs the child by default", async () => {
    const child = makeFakeChild();
    const { life } = makeLifecycle({ spawn: vi.fn(() => child) });

    await life.launch({ command: "/srv/start.sh" });

    expect(child.unref).toHaveBeenCalled();
  });

  it("spawns with the provided env", async () => {
    const { life, spawn } = makeLifecycle();
    const env = { LD_LIBRARY_PATH: "/srv/linux64" };

    await life.launch({ command: "/srv/start.sh", env });

    expect(spawn).toHaveBeenCalledWith(
      "/srv/start.sh",
      [],
      expect.objectContaining({ env }),
    );
  });

  it("returns {success: false} on spawn error, never throws", async () => {
    const { life } = makeLifecycle({
      spawn: vi.fn(() => {
        throw new Error("spawn EACCES");
      }),
    });

    const result = await life.launch({ command: "/srv/start.sh" });

    expect(result).toEqual({ success: false, error: "spawn EACCES" });
  });
});

// ── terminate() ───────────────────────────────────────────────────────

describe("NativeLifecycle.terminate", () => {
  it("returns {success: true} with an empty PID array, without killing", async () => {
    const { life, execFile, exec } = makeLifecycle();

    const result = await life.terminate([]);

    expect(result).toEqual({ success: true, message: "No PIDs to terminate" });
    expect(execFile).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it("calls kill -9 on Linux with the given PIDs", async () => {
    const { life, execFile } = makeLifecycle({ isWindows: false });

    const result = await life.terminate([111, 222]);

    expect(execFile).toHaveBeenCalledWith("kill", ["-9", "111", "222"], expect.any(Function));
    expect(result.success).toBe(true);
  });

  it("calls taskkill per-PID on Windows", async () => {
    const { life, execFile } = makeLifecycle({ isWindows: true });

    const result = await life.terminate(["111", "222"]);

    expect(execFile).toHaveBeenCalledWith("taskkill", ["/PID", "111", "/F"], expect.any(Function));
    expect(execFile).toHaveBeenCalledWith("taskkill", ["/PID", "222", "/F"], expect.any(Function));
    expect(result.success).toBe(true);
  });

  it("returns {success: false} on error, never throws", async () => {
    const { life } = makeLifecycle({
      execFile: vi.fn(() => {
        throw new Error("boom");
      }),
    });

    const result = await life.terminate([111]);

    expect(result).toEqual({ success: false, error: "boom" });
  });
});

// ── terminateAll() ───────────────────────────────────────────────────

describe("NativeLifecycle.terminateAll", () => {
  it("calls pkill on Linux", async () => {
    const { life, exec } = makeLifecycle({ isWindows: false });

    const result = await life.terminateAll();

    expect(exec).toHaveBeenCalledWith(expect.stringContaining("pkill -9"), expect.any(Function));
    expect(result).toEqual({ success: true, message: "Force kill executed" });
  });

  it("calls taskkill then powershell on Windows", async () => {
    const { life, exec } = makeLifecycle({ isWindows: true });

    const result = await life.terminateAll();

    expect(exec).toHaveBeenCalledWith(
      "taskkill /IM ProjectZomboid64.exe /F",
      expect.any(Function),
    );
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining("powershell"),
      expect.any(Function),
    );
    expect(result.success).toBe(true);
  });

  it("returns {success: false} on error, never throws", async () => {
    const { life } = makeLifecycle({
      exec: vi.fn(() => {
        throw new Error("boom");
      }),
    });

    const result = await life.terminateAll();

    expect(result).toEqual({ success: false, error: "boom" });
  });
});

// ── isRunning() ──────────────────────────────────────────────────────

describe("NativeLifecycle.isRunning", () => {
  it("returns false — process detection is a known gap, stays in ServerManager", async () => {
    const { life } = makeLifecycle();

    expect(await life.isRunning("my-server")).toBe(false);
  });
});
