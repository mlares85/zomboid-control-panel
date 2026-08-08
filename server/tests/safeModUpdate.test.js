import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// safeModUpdate.js (and the logger it imports) read/create paths via
// getDataPaths().logsDir at import time, so this must be a real directory
// before anything is imported below.
const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-update-test-"));
vi.mock("../utils/paths.js", () => ({
  getDataPaths: () => ({ logsDir }),
}));

const { runSafeModUpdate, isSafeUpdateInProgress, clampWarningSeconds } =
  await import("../services/safeModUpdate.js");
const launchLogPath = path.join(logsDir, "server-launch.log");

function makeFakes(overrides = {}) {
  const events = [];
  const io = { emit: (event, payload) => events.push({ event, payload }) };

  const backupService = {
    createBackup: vi
      .fn()
      .mockResolvedValue({ success: true, backup: { name: "backup.zip" } }),
    ...overrides.backupService,
  };

  const modChecker = {
    checkForUpdates: vi
      .fn()
      .mockResolvedValue({ updated: true, mods: [{ name: "Mod A", workshopId: "1" }] }),
    ...overrides.modChecker,
  };

  let running = true;
  const serverManager = {
    checkServerRunning: vi.fn(async () => running),
    stopServer: vi.fn(async () => {
      running = false;
      return { success: true };
    }),
    startServer: vi.fn(async () => {
      running = true;
      return { success: true };
    }),
    ...overrides.serverManager,
  };
  // Let tests flip the shared `running` flag from the outside (e.g. to
  // simulate the server actually stopping after quit()).
  serverManager.__setRunning = (value) => {
    running = value;
  };

  const rconService = {
    connected: true,
    save: vi.fn().mockResolvedValue({ success: true }),
    quit: vi.fn().mockResolvedValue({ success: true }),
    serverMessage: vi.fn().mockResolvedValue({ success: true }),
    connect: vi.fn().mockResolvedValue(true),
    setServerStarting: vi.fn(),
    ...overrides.rconService,
  };

  return { io, events, backupService, modChecker, serverManager, rconService };
}

describe("clampWarningSeconds", () => {
  it("defaults to 30 for invalid input", () => {
    expect(clampWarningSeconds(undefined)).toBe(30);
    expect(clampWarningSeconds(-5)).toBe(30);
    expect(clampWarningSeconds("nope")).toBe(30);
  });

  it("caps at 600 seconds", () => {
    expect(clampWarningSeconds(99999)).toBe(600);
  });

  it("passes through valid values", () => {
    expect(clampWarningSeconds(45)).toBe(45);
  });
});

describe("runSafeModUpdate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fs.rmSync(launchLogPath, { force: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses to start when the server is not running", async () => {
    const fakes = makeFakes({
      serverManager: { checkServerRunning: vi.fn(async () => false) },
    });

    const result = await runSafeModUpdate({ ...fakes, warningSeconds: 1 });

    expect(result).toEqual({ success: false, message: "Server is not running" });
    expect(fakes.backupService.createBackup).not.toHaveBeenCalled();
  });

  it("refuses to start when RCON is not connected", async () => {
    const fakes = makeFakes({ rconService: { connected: false } });

    const result = await runSafeModUpdate({ ...fakes, warningSeconds: 1 });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/RCON/);
    expect(fakes.backupService.createBackup).not.toHaveBeenCalled();
  });

  it("runs backup -> update -> warning -> restart -> verify in order and emits progress", async () => {
    const fakes = makeFakes();
    const promise = runSafeModUpdate({ ...fakes, warningSeconds: 5 });

    // Let the warning-step sleep(5000) elapse under fake timers.
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(fakes.backupService.createBackup).toHaveBeenCalledTimes(1);
    expect(fakes.modChecker.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(fakes.rconService.serverMessage).toHaveBeenCalledWith(
      expect.stringContaining("5s"),
    );
    expect(fakes.rconService.save).toHaveBeenCalledTimes(1);
    expect(fakes.rconService.quit).toHaveBeenCalledTimes(1);
    expect(fakes.serverManager.startServer).toHaveBeenCalledWith({
      skipRunningCheck: true,
    });

    const steps = fakes.events
      .filter((e) => e.event === "modUpdate:step")
      .map((e) => e.payload.step);
    expect(steps).toEqual(
      expect.arrayContaining(["backup", "update", "warning", "restart", "verify"]),
    );
    const lastVerify = fakes.events
      .filter((e) => e.payload.step === "verify")
      .pop();
    expect(lastVerify.payload.status).toBe("success");
  });

  it("stops after a failed backup and never sends the restart warning", async () => {
    const fakes = makeFakes({
      backupService: {
        createBackup: vi
          .fn()
          .mockResolvedValue({ success: false, message: "Disk full" }),
      },
    });

    const result = await runSafeModUpdate({ ...fakes, warningSeconds: 1 });

    expect(result).toEqual({
      success: false,
      step: "backup",
      message: "Disk full",
    });
    expect(fakes.rconService.serverMessage).not.toHaveBeenCalled();
    expect(fakes.rconService.quit).not.toHaveBeenCalled();
  });

  it("force-stops the server if it does not stop on its own after quit", async () => {
    const fakes = makeFakes();
    // Server never reports stopped via polling — forces the fallback path.
    let stopped = false;
    fakes.serverManager.checkServerRunning = vi.fn(async () => !stopped);
    fakes.serverManager.stopServer = vi.fn(async () => {
      stopped = true;
      return { success: true };
    });
    fakes.serverManager.startServer = vi.fn(async () => {
      stopped = false;
      return { success: true };
    });

    const promise = runSafeModUpdate({ ...fakes, warningSeconds: 1 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(fakes.serverManager.stopServer).toHaveBeenCalledWith(false);
  });

  it("fails the restart step when the server never comes back and reports it", async () => {
    const fakes = makeFakes({
      serverManager: {
        checkServerRunning: vi.fn(async () => true),
        stopServer: vi.fn(async () => ({ success: true })),
        startServer: vi.fn().mockRejectedValue(new Error("boom")),
      },
    });
    fakes.serverManager.checkServerRunning = vi
      .fn()
      .mockResolvedValueOnce(true) // initial validation
      .mockResolvedValueOnce(false); // stop-poll sees it already stopped

    const promise = runSafeModUpdate({ ...fakes, warningSeconds: 1 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ success: false, step: "restart", message: "boom" });
    const failed = fakes.events.find(
      (e) => e.payload.step === "restart" && e.payload.status === "failed",
    );
    expect(failed).toBeTruthy();
  });

  it("fails verify when the launch log shows a crash signature", async () => {
    fs.writeFileSync(
      path.join(logsDir, "server-launch.log"),
      "booting...\nException in thread \"main\" java.lang.RuntimeException\n",
    );
    const fakes = makeFakes();

    const promise = runSafeModUpdate({ ...fakes, warningSeconds: 1 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.step).toBe("verify");
  });

  it("rejects a second call while one is already in progress", async () => {
    const fakes = makeFakes();
    // Hold the backup step open so the first run is still "in progress".
    let releaseBackup;
    fakes.backupService.createBackup = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseBackup = () =>
            resolve({ success: true, backup: { name: "b.zip" } });
        }),
    );

    const first = runSafeModUpdate({ ...fakes, warningSeconds: 1 });
    await vi.waitFor(() => expect(isSafeUpdateInProgress()).toBe(true));

    const second = await runSafeModUpdate({ ...makeFakes(), warningSeconds: 1 });
    expect(second).toEqual({
      success: false,
      message: "A safe update is already in progress",
    });

    releaseBackup();
    await vi.runAllTimersAsync();
    await first;
    expect(isSafeUpdateInProgress()).toBe(false);
  });
});
