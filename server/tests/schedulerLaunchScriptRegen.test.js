import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for: scheduled restarts skipped the launch-script
// regeneration that manual start (routes/server/lifecycle.js POST /start)
// performs, so config changes (admin password, memory, etc.) made between
// restarts never took effect until someone manually stopped/started the
// server. See upstream fpsacha@ab3700c1.

const regenerateStartupScriptsForServer = vi.fn().mockResolvedValue({ success: true });
vi.mock("../routes/server/startupScripts.js", () => ({
  regenerateStartupScriptsForServer: (...args) =>
    regenerateStartupScriptsForServer(...args),
}));

const getServer = vi.fn();
const getActiveServer = vi.fn().mockResolvedValue(null);
vi.mock("../database/init.js", () => ({
  getScheduledTasks: vi.fn(),
  getServer: (...args) => getServer(...args),
  getActiveServer: (...args) => getActiveServer(...args),
  updateTaskLastRun: vi.fn().mockResolvedValue(),
  logServerEvent: vi.fn().mockResolvedValue(),
  logScheduleExecution: vi.fn().mockResolvedValue(),
}));

const { Scheduler } = await import("../services/scheduler.js");

function makeRcon(overrides = {}) {
  return {
    connected: true,
    execute: vi.fn().mockResolvedValue({ success: true }),
    save: vi.fn().mockResolvedValue({ success: true }),
    serverMessage: vi.fn().mockResolvedValue({ success: true }),
    quit: vi.fn().mockResolvedValue({ success: true }),
    connect: vi.fn().mockResolvedValue(),
    ...overrides,
  };
}

function makeServerManager(overrides = {}) {
  return {
    _serverId: 42,
    _isDockerBacked: () => false,
    checkServerRunning: vi.fn().mockResolvedValue(false),
    startServer: vi.fn().mockResolvedValue({ success: true }),
    stopServer: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

describe("Scheduler.performRestart regenerates the launch script", () => {
  beforeEach(() => {
    regenerateStartupScriptsForServer.mockClear();
    getServer.mockReset();
    getActiveServer.mockReset().mockResolvedValue(null);
  });

  it("regenerates the script before starting a server that was found offline", async () => {
    const record = { id: 42, installPath: "/data/pz", serverName: "MyServer" };
    getServer.mockResolvedValue(record);
    const serverManager = makeServerManager();
    const scheduler = new Scheduler(makeRcon(), serverManager);
    scheduler.sleep = vi.fn().mockResolvedValue();

    await scheduler.performRestart();

    expect(getServer).toHaveBeenCalledWith(42);
    expect(regenerateStartupScriptsForServer).toHaveBeenCalledWith(record);
    // Script must be regenerated BEFORE the process launches, matching
    // manual start's ordering (write the config the process will read).
    const regenOrder = regenerateStartupScriptsForServer.mock.invocationCallOrder[0];
    const startOrder = serverManager.startServer.mock.invocationCallOrder[0];
    expect(regenOrder).toBeLessThan(startOrder);
  });

  it("regenerates the script before restarting a server that was running", async () => {
    const record = { id: 42, installPath: "/data/pz", serverName: "MyServer" };
    getServer.mockResolvedValue(record);
    const serverManager = makeServerManager({
      // Running, then confirmed stopped after quit.
      checkServerRunning: vi
        .fn()
        .mockResolvedValueOnce(true) // initial "is it running" check
        .mockResolvedValueOnce(false) // stop-wait loop: already stopped
        .mockResolvedValueOnce(true), // post-start "did it come up" check
    });
    const scheduler = new Scheduler(makeRcon(), serverManager);
    scheduler.sleep = vi.fn().mockResolvedValue();

    await scheduler.performRestart(0); // no warning countdown

    expect(regenerateStartupScriptsForServer).toHaveBeenCalledWith(record);
    const regenOrder = regenerateStartupScriptsForServer.mock.invocationCallOrder[0];
    const startOrder = serverManager.startServer.mock.invocationCallOrder[0];
    expect(regenOrder).toBeLessThan(startOrder);
  });

  it("never blocks the restart when script regeneration fails", async () => {
    getServer.mockResolvedValue({ id: 42, installPath: "/data/pz" });
    regenerateStartupScriptsForServer.mockResolvedValueOnce({
      success: false,
      error: "disk full",
    });
    const serverManager = makeServerManager({
      // Offline when checked, confirmed up once startServer() has run.
      checkServerRunning: vi
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true),
    });
    const scheduler = new Scheduler(
      makeRcon({ connected: false, execute: vi.fn().mockResolvedValue({ success: false }) }),
      serverManager,
    );
    scheduler.sleep = vi.fn().mockResolvedValue();

    const result = await scheduler.performRestart();

    expect(result.success).toBe(true);
    expect(serverManager.startServer).toHaveBeenCalled();
  });
});
