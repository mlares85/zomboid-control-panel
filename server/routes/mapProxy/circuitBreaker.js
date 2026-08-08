import { createLogger } from "../../utils/logger.js";

const log = createLogger("API:MapProxy");

// ─── Circuit breaker for the upstream tile hosts ─────────────────────────
// Without this, a truly dead upstream (e.g. a Cloudflare outage on the map
// host) makes EVERY tile request pay the full timeout+retry cost
// (~10-20s each) with no backpressure, and the map view fires dozens of
// tile requests per pan/zoom — piling up slow handlers. After enough
// consecutive failures we fail fast for a cooldown instead of continuing to
// hammer (and wait on) a host that's already down.
const CIRCUIT_FAILURE_THRESHOLD = 8;
const CIRCUIT_COOLDOWN_MS = 30_000;
let circuitConsecutiveFailures = 0;
let circuitOpenUntil = 0;

export function isCircuitOpen() {
  return Date.now() < circuitOpenUntil;
}

export function recordTileSuccess() {
  circuitConsecutiveFailures = 0;
}

export function recordTileFailure() {
  circuitConsecutiveFailures++;
  if (
    circuitConsecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD &&
    !isCircuitOpen()
  ) {
    circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    log.warn(
      `Tile proxy circuit breaker OPEN for ${CIRCUIT_COOLDOWN_MS / 1000}s after ${circuitConsecutiveFailures} consecutive upstream failures`,
    );
  }
}
