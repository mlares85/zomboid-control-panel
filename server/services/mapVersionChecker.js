import { createLogger } from "../utils/logger.js";
import { getSetting, setSetting } from "../database/init.js";

const log = createLogger("MapVersionChecker");

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MIN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MAX_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SETTING_KEY = "mapCheckIntervalMs";

/**
 * Periodically checks map.projectzomboid.com for new PZ map builds and
 * emits Socket.IO events when one is detected. Interval is user-configurable
 * via the settings API (default: 24h).
 *
 * Follows the same pattern as DiskMonitor / ContainerStatsPoller: construct
 * with io, call start(), stop(). Re-resolves the active build via the
 * injected resolver on each tick.
 */
export class MapVersionChecker {
  constructor(io, { resolveLatest, getVersions }) {
    this.io = io;
    this.resolveLatest = resolveLatest;
    this.getVersions = getVersions;
    this.timer = null;
    this.intervalMs = DEFAULT_INTERVAL_MS;
    this.currentVersion = null;
    this.lastCheckAt = null;
    this.lastChangeAt = null;
    this.availableVersions = [];
  }

  async loadInterval() {
    const stored = await getSetting(SETTING_KEY);
    if (typeof stored === "number" && stored >= MIN_INTERVAL_MS && stored <= MAX_INTERVAL_MS) {
      this.intervalMs = stored;
    }
  }

  async setInterval(ms) {
    const clamped = Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, ms));
    this.intervalMs = clamped;
    await setSetting(SETTING_KEY, clamped);
    this._restartTimer();
    return clamped;
  }

  async checkNow() {
    try {
      const map = await this.resolveLatest();
      const versions = await this.getVersions();
      this.lastCheckAt = Date.now();
      this.availableVersions = versions;

      const newVersion = map.directory;
      if (this.currentVersion && newVersion !== this.currentVersion) {
        log.info(`New map version detected: ${this.currentVersion} → ${newVersion}`);
        this.lastChangeAt = Date.now();
        if (this.io) {
          this.io.emit("map:version-changed", {
            previous: this.currentVersion,
            current: newVersion,
            versions,
          });
        }
      }
      this.currentVersion = newVersion;
      return { version: newVersion, changed: false };
    } catch (err) {
      log.warn(`Map version check failed: ${err.message}`);
      return { version: this.currentVersion, error: err.message };
    }
  }

  getStatus() {
    return {
      currentVersion: this.currentVersion,
      intervalMs: this.intervalMs,
      lastCheckAt: this.lastCheckAt,
      lastChangeAt: this.lastChangeAt,
      nextCheckAt: this.lastCheckAt ? this.lastCheckAt + this.intervalMs : null,
      availableVersions: this.availableVersions,
    };
  }

  _restartTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._startTimer();
  }

  _startTimer() {
    this.timer = setInterval(() => {
      this.checkNow().catch((err) =>
        log.error(`Map version check tick failed: ${err.message}`),
      );
    }, this.intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  async start() {
    if (this.timer) return;
    await this.loadInterval();
    // Initial check seeds currentVersion without emitting "changed"
    await this.checkNow().catch((err) =>
      log.error(`Initial map version check failed: ${err.message}`),
    );
    this._startTimer();
    log.info(
      `started (checking every ${Math.round(this.intervalMs / 3600000)}h, current: ${this.currentVersion})`,
    );
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export { DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS, MAX_INTERVAL_MS, SETTING_KEY };
