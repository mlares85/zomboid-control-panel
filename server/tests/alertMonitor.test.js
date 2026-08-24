import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlertMonitor } from "../services/alertMonitor.js";

function makeCondition(overrides = {}) {
  return {
    id: "ram-warning",
    name: "RAM usage above 90%",
    metric: "memory.usagePercent",
    operator: ">",
    threshold: 90,
    severity: "warning",
    cooldownMinutes: 30,
    enabled: true,
    ...overrides,
  };
}

function makeMonitor({ metricsSequence, conditions, pushoverResult = { success: true } } = {}) {
  let call = 0;
  const metrics = metricsSequence ?? [{ memory: { usagePercent: 50 } }];
  const collectMetrics = vi.fn(async () => metrics[Math.min(call++, metrics.length - 1)]);
  const getConditions = vi.fn(async () => conditions ?? [makeCondition()]);
  const sendNotification = vi.fn(async () => pushoverResult);
  const pushoverService = { sendNotification };
  const monitor = new AlertMonitor({ pushoverService, collectMetrics, getConditions });
  return { monitor, collectMetrics, getConditions, sendNotification };
}

describe("AlertMonitor.checkNow", () => {
  it("does nothing when no condition is triggered", async () => {
    const { monitor, sendNotification } = makeMonitor({
      metricsSequence: [{ memory: { usagePercent: 10 } }],
    });
    await monitor.checkNow();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends a Pushover notification on the transition into a triggered state", async () => {
    const { monitor, sendNotification } = makeMonitor({
      metricsSequence: [{ memory: { usagePercent: 95 } }],
    });
    await monitor.checkNow();
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [payload] = sendNotification.mock.calls[0];
    expect(payload.title).toContain("RAM usage above 90%");
  });

  it("is edge-triggered: does not re-alert while the condition stays triggered", async () => {
    const { monitor, sendNotification } = makeMonitor({
      metricsSequence: [{ memory: { usagePercent: 95 } }, { memory: { usagePercent: 96 } }],
    });
    await monitor.checkNow();
    await monitor.checkNow();
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("re-alerts after the condition clears and re-triggers, once cooldown has passed", async () => {
    const { monitor, sendNotification } = makeMonitor({
      metricsSequence: [
        { memory: { usagePercent: 95 } },
        { memory: { usagePercent: 10 } },
        { memory: { usagePercent: 95 } },
      ],
      conditions: [makeCondition({ cooldownMinutes: 0 })],
    });
    await monitor.checkNow();
    await monitor.checkNow();
    await monitor.checkNow();
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("respects the condition's cooldown even after clearing and re-triggering", async () => {
    const { monitor, sendNotification } = makeMonitor({
      metricsSequence: [
        { memory: { usagePercent: 95 } },
        { memory: { usagePercent: 10 } },
        { memory: { usagePercent: 95 } },
      ],
      conditions: [makeCondition({ cooldownMinutes: 30 })],
    });
    await monitor.checkNow();
    await monitor.checkNow();
    await monitor.checkNow();
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("does not record an alert time when the Pushover send fails, so it retries next edge", async () => {
    const { monitor, sendNotification } = makeMonitor({
      metricsSequence: [
        { memory: { usagePercent: 95 } },
        { memory: { usagePercent: 10 } },
        { memory: { usagePercent: 95 } },
      ],
      conditions: [makeCondition({ cooldownMinutes: 0 })],
      pushoverResult: { success: false, error: "network down" },
    });
    await monitor.checkNow();
    await monitor.checkNow();
    await monitor.checkNow();
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("handles multiple conditions independently", async () => {
    const { monitor, sendNotification } = makeMonitor({
      metricsSequence: [{ memory: { usagePercent: 95 }, cpu: { usagePercent: 95 } }],
      conditions: [
        makeCondition({ id: "ram", metric: "memory.usagePercent" }),
        makeCondition({ id: "cpu", metric: "cpu.usagePercent" }),
      ],
    });
    await monitor.checkNow();
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("does nothing when collectMetrics resolves null/undefined", async () => {
    const collectMetrics = vi.fn(async () => null);
    const getConditions = vi.fn(async () => [makeCondition()]);
    const sendNotification = vi.fn();
    const monitor = new AlertMonitor({
      pushoverService: { sendNotification },
      collectMetrics,
      getConditions,
    });
    await monitor.checkNow();
    expect(sendNotification).not.toHaveBeenCalled();
    expect(getConditions).not.toHaveBeenCalled();
  });
});

describe("AlertMonitor start/stop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("polls on the configured interval", async () => {
    const { monitor, collectMetrics } = makeMonitor();
    monitor.intervalMs = 30_000;
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(collectMetrics).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(collectMetrics).toHaveBeenCalledTimes(2);
    monitor.stop();
    vi.useRealTimers();
  });

  it("stop() clears the timer so no further polling occurs", async () => {
    const { monitor, collectMetrics } = makeMonitor();
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    monitor.stop();
    const callsAfterStop = collectMetrics.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(collectMetrics).toHaveBeenCalledTimes(callsAfterStop);
    vi.useRealTimers();
  });
});
