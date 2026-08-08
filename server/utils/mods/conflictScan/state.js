import { createLogger } from "../../logger.js";

const log = createLogger("API:Mods");

// Prevent concurrent scans from hammering disk I/O
let conflictScanInFlight = false;
let conflictScanStartedAt = 0;
const SCAN_MUTEX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// In-memory cache of last scan result (cleared on config changes or after TTL)
let lastScanResult = null;
let lastScanWorkshopSnapshot = null;
let lastScanModSnapshot = null;
let lastScanServerPath = null;
let lastScanTimestamp = 0;
let scanLockToken = 0;
export const SCAN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Returns a token identifying this scan, or null when a scan is already running.
export function acquireScanLock() {
  // Auto-reset if stuck for more than 5 minutes (e.g. crash mid-scan)
  if (
    conflictScanInFlight &&
    Date.now() - conflictScanStartedAt > SCAN_MUTEX_TIMEOUT_MS
  ) {
    log.warn("Conflict scan mutex was stuck for >5 min — auto-resetting");
    conflictScanInFlight = false;
  }
  if (conflictScanInFlight) return null;
  conflictScanInFlight = true;
  conflictScanStartedAt = Date.now();
  return ++scanLockToken;
}

// Tokens stop a scan that overran the stuck-mutex timeout from releasing the
// lock out from under the newer scan that replaced it.
export function releaseScanLock(token) {
  if (token !== scanLockToken) return;
  conflictScanInFlight = false;
  conflictScanStartedAt = 0;
}

export function getCachedScan() {
  return {
    result: lastScanResult,
    timestamp: lastScanTimestamp,
    workshopSnapshot: lastScanWorkshopSnapshot,
    modSnapshot: lastScanModSnapshot,
    serverPath: lastScanServerPath,
  };
}

export function setCachedScan({
  result,
  workshopSnapshot,
  modSnapshot,
  serverPath,
}) {
  lastScanResult = result;
  lastScanTimestamp = Date.now();
  lastScanWorkshopSnapshot = workshopSnapshot;
  lastScanModSnapshot = modSnapshot;
  lastScanServerPath = serverPath;
}
