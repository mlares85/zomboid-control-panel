/**
 * Pure alert-condition evaluation for the Pushover alerting system.
 * No I/O here — alertMonitor.js supplies live metrics and owns polling,
 * cooldown bookkeeping, and actually sending notifications.
 */

// Metric value lookup uses dot-notation paths (e.g. "memory.usagePercent")
// against the metrics object alertMonitor assembles each tick.
function getMetricValue(metrics, path) {
  return path.split(".").reduce((obj, key) => (obj == null ? undefined : obj[key]), metrics);
}

const OPERATORS = {
  ">": (a, b) => a > b,
  ">=": (a, b) => a >= b,
  "<": (a, b) => a < b,
  "<=": (a, b) => a <= b,
  "==": (a, b) => a === b,
  "!=": (a, b) => a !== b,
};

/** Evaluate a single condition against a metrics snapshot. */
export function evaluateCondition(condition, metrics) {
  if (!condition.enabled) return false;
  const value = getMetricValue(metrics, condition.metric);
  if (value === undefined || value === null) return false;
  const compare = OPERATORS[condition.operator];
  if (!compare) return false;
  return compare(value, condition.threshold);
}

/** Return the subset of conditions that are currently triggered. */
export function evaluateConditions(conditions, metrics) {
  return conditions.filter((condition) => evaluateCondition(condition, metrics));
}

/**
 * Cooldown gate: a condition may re-alert only after cooldownMinutes has
 * elapsed since its last alert. No prior alert always allows one through.
 */
export function shouldAlert(condition, lastAlertTime) {
  if (!lastAlertTime) return true;
  const cooldownMs = (condition.cooldownMinutes ?? 0) * 60_000;
  return Date.now() - lastAlertTime >= cooldownMs;
}

export const DEFAULT_CONDITIONS = [
  {
    id: "ram-warning",
    name: "RAM usage above 90%",
    metric: "memory.usagePercent",
    operator: ">",
    threshold: 90,
    severity: "warning",
    cooldownMinutes: 30,
    enabled: true,
  },
  {
    id: "ram-critical",
    name: "RAM usage above 95%",
    metric: "memory.usagePercent",
    operator: ">",
    threshold: 95,
    severity: "critical",
    cooldownMinutes: 15,
    enabled: true,
  },
  {
    id: "cpu-warning",
    name: "CPU usage above 90%",
    metric: "cpu.usagePercent",
    operator: ">",
    threshold: 90,
    severity: "warning",
    cooldownMinutes: 30,
    enabled: true,
  },
  {
    id: "disk-warning",
    name: "Disk usage above 90%",
    metric: "disk.usagePercent",
    operator: ">",
    threshold: 90,
    severity: "warning",
    cooldownMinutes: 60,
    enabled: true,
  },
  {
    id: "disk-critical",
    name: "Disk usage above 95%",
    metric: "disk.usagePercent",
    operator: ">",
    threshold: 95,
    severity: "critical",
    cooldownMinutes: 30,
    enabled: true,
  },
  {
    id: "server-offline",
    name: "Server is offline",
    metric: "server.offline",
    operator: "==",
    threshold: true,
    severity: "critical",
    cooldownMinutes: 10,
    enabled: true,
  },
  {
    id: "crash-loop",
    name: "Server is crash-looping",
    metric: "server.crashLoop",
    operator: "==",
    threshold: true,
    severity: "critical",
    cooldownMinutes: 10,
    enabled: true,
  },
];
