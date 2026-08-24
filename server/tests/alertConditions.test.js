import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONDITIONS,
  evaluateCondition,
  evaluateConditions,
  shouldAlert,
} from "../services/alertConditions.js";

const memMetrics = { memory: { usagePercent: 92 }, cpu: { usagePercent: 10 }, disk: { usagePercent: 10 } };

function makeCondition(overrides = {}) {
  return {
    id: "test",
    name: "Test condition",
    metric: "memory.usagePercent",
    operator: ">",
    threshold: 90,
    severity: "warning",
    cooldownMinutes: 30,
    enabled: true,
    ...overrides,
  };
}

describe("evaluateCondition", () => {
  it("triggers when the metric crosses the threshold", () => {
    expect(evaluateCondition(makeCondition(), memMetrics)).toBe(true);
  });

  it("does not trigger when the metric is below the threshold", () => {
    expect(evaluateCondition(makeCondition({ threshold: 95 }), memMetrics)).toBe(false);
  });

  it("does not trigger a disabled condition", () => {
    expect(evaluateCondition(makeCondition({ enabled: false }), memMetrics)).toBe(false);
  });

  it("does not trigger when the metric path is missing from the metrics object", () => {
    expect(evaluateCondition(makeCondition({ metric: "memory.doesNotExist" }), memMetrics)).toBe(false);
  });

  it("supports boolean equality metrics like server.offline", () => {
    const condition = makeCondition({ metric: "server.offline", operator: "==", threshold: true });
    expect(evaluateCondition(condition, { server: { offline: true } })).toBe(true);
    expect(evaluateCondition(condition, { server: { offline: false } })).toBe(false);
  });

  it("supports server.crashLoop boolean metric", () => {
    const condition = makeCondition({ metric: "server.crashLoop", operator: "==", threshold: true });
    expect(evaluateCondition(condition, { server: { crashLoop: true } })).toBe(true);
  });

  it("supports the >= operator at the exact threshold", () => {
    const condition = makeCondition({ operator: ">=", threshold: 92 });
    expect(evaluateCondition(condition, memMetrics)).toBe(true);
  });

  it("supports the < and <= operators", () => {
    expect(evaluateCondition(makeCondition({ operator: "<", threshold: 10 }), memMetrics)).toBe(false);
    expect(
      evaluateCondition(makeCondition({ metric: "cpu.usagePercent", operator: "<=", threshold: 10 }), memMetrics),
    ).toBe(true);
  });

  it("returns false for an unknown operator", () => {
    expect(evaluateCondition(makeCondition({ operator: "??" }), memMetrics)).toBe(false);
  });
});

describe("evaluateConditions", () => {
  it("returns only the conditions that triggered", () => {
    const conditions = [
      makeCondition({ id: "ram-warn", threshold: 90 }),
      makeCondition({ id: "ram-crit", threshold: 95 }),
      makeCondition({ id: "cpu", metric: "cpu.usagePercent", threshold: 5 }),
    ];
    const triggered = evaluateConditions(conditions, memMetrics);
    expect(triggered.map((c) => c.id)).toEqual(["ram-warn", "cpu"]);
  });

  it("returns an empty array when nothing triggers", () => {
    expect(evaluateConditions([makeCondition({ threshold: 200 })], memMetrics)).toEqual([]);
  });
});

describe("shouldAlert", () => {
  it("allows an alert when there is no previous alert time", () => {
    expect(shouldAlert(makeCondition({ cooldownMinutes: 30 }), null)).toBe(true);
  });

  it("blocks an alert still within its cooldown window", () => {
    const lastAlertTime = Date.now() - 5 * 60_000;
    expect(shouldAlert(makeCondition({ cooldownMinutes: 30 }), lastAlertTime)).toBe(false);
  });

  it("allows an alert once the cooldown window has elapsed", () => {
    const lastAlertTime = Date.now() - 31 * 60_000;
    expect(shouldAlert(makeCondition({ cooldownMinutes: 30 }), lastAlertTime)).toBe(true);
  });

  it("allows an alert immediately when cooldownMinutes is 0", () => {
    const lastAlertTime = Date.now();
    expect(shouldAlert(makeCondition({ cooldownMinutes: 0 }), lastAlertTime)).toBe(true);
  });
});

describe("DEFAULT_CONDITIONS", () => {
  it("includes RAM warning and critical thresholds", () => {
    const ram = DEFAULT_CONDITIONS.filter((c) => c.metric === "memory.usagePercent");
    expect(ram.map((c) => c.threshold).sort((a, b) => a - b)).toEqual([90, 95]);
  });

  it("includes a CPU threshold above 90", () => {
    const cpu = DEFAULT_CONDITIONS.find((c) => c.metric === "cpu.usagePercent");
    expect(cpu.threshold).toBe(90);
  });

  it("includes disk warning and critical thresholds", () => {
    const disk = DEFAULT_CONDITIONS.filter((c) => c.metric === "disk.usagePercent");
    expect(disk.map((c) => c.threshold).sort((a, b) => a - b)).toEqual([90, 95]);
  });

  it("includes server offline and crash loop conditions", () => {
    const metrics = DEFAULT_CONDITIONS.map((c) => c.metric);
    expect(metrics).toContain("server.offline");
    expect(metrics).toContain("server.crashLoop");
  });

  it("gives every default condition a unique id and is enabled by default", () => {
    const ids = DEFAULT_CONDITIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DEFAULT_CONDITIONS.every((c) => c.enabled)).toBe(true);
  });
});
