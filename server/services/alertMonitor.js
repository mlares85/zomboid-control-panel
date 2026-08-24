import { createLogger } from "../utils/logger.js";
import { evaluateConditions, shouldAlert } from "./alertConditions.js";

const log = createLogger("AlertMonitor");

export const POLL_INTERVAL_MS = 30_000;

/** Priority mapping for how urgently Pushover should surface each severity. */
const SEVERITY_PRIORITY = { critical: 1, warning: 0 };

/**
 * Polls metrics on an interval, evaluates alert conditions against them,
 * and sends a Pushover notification on each edge-trigger (state transition
 * into "triggered") — not on every tick a condition remains triggered.
 * Metrics and conditions are supplied by the caller (constructor injection)
 * so this class has no direct dependency on Docker, disk, or the database.
 */
export class AlertMonitor {
  constructor({ pushoverService, collectMetrics, getConditions, intervalMs = POLL_INTERVAL_MS } = {}) {
    this.pushoverService = pushoverService;
    this.collectMetrics = collectMetrics;
    this.getConditions = getConditions;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.lastAlertTimes = {};
    this._activeConditionIds = new Set();
  }

  async checkNow() {
    const metrics = await this.collectMetrics();
    if (!metrics) return;
    const conditions = await this.getConditions();
    const triggered = evaluateConditions(conditions, metrics);
    await this._processTriggered(triggered);
  }

  async _processTriggered(triggered) {
    for (const condition of triggered) {
      if (this._isNewEdge(condition) && shouldAlert(condition, this.lastAlertTimes[condition.id])) {
        await this._sendAlert(condition);
      }
    }
    this._activeConditionIds = new Set(triggered.map((condition) => condition.id));
  }

  _isNewEdge(condition) {
    return !this._activeConditionIds.has(condition.id);
  }

  async _sendAlert(condition) {
    const result = await this.pushoverService.sendNotification({
      title: condition.name,
      message: `${condition.name} (severity: ${condition.severity})`,
      priority: SEVERITY_PRIORITY[condition.severity] ?? 0,
    });
    if (result.success) {
      this.lastAlertTimes[condition.id] = Date.now();
    } else {
      log.error(`Failed to send Pushover alert for '${condition.id}': ${result.error}`);
    }
  }

  start() {
    if (this.timer) return;
    this.checkNow().catch((err) => log.error(`Initial alert check failed: ${err.message}`));
    this.timer = setInterval(() => {
      this.checkNow().catch((err) => log.error(`Alert check failed: ${err.message}`));
    }, this.intervalMs);
    if (this.timer.unref) this.timer.unref();
    log.info(`started (checking every ${this.intervalMs / 1000}s)`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
