import path from "path";
import { safePathExists, safeReaddir } from "../../fsProbe.js";

// ─── World Map Diagnostics ───────────────────────────────────────────
// Dedicated checks for everything the World Map page depends on:
// tile CDNs (b42map.com / map.projectzomboid.com), PanelBridge handlers
// for live player/vehicle/safehouse data, save folder layout (B41 vs B42),
// and the local /api/map proxy itself.
export const TILE_PROBE_TIMEOUT_MS = 5000;
export const WORLDMAP_HANDLERS = [
  "getServerInfo",
  "getVehiclesDetailed",
  "getSafehouses",
  "triggerAirdrop",
];

export async function probeTile(url) {
  const t0 = Date.now();
  try {
    const ctrl = AbortSignal.timeout(TILE_PROBE_TIMEOUT_MS);
    // HEAD avoids transferring the full image. Some CDNs reject HEAD —
    // fall back to a ranged GET for the first byte.
    let resp = await fetch(url, { method: "HEAD", signal: ctrl }).catch(
      () => null,
    );
    if (!resp || !resp.ok) {
      resp = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        signal: AbortSignal.timeout(TILE_PROBE_TIMEOUT_MS),
      });
    }
    return {
      url,
      reachable: resp.ok || resp.status === 206,
      statusCode: resp.status,
      latencyMs: Date.now() - t0,
      error: null,
    };
  } catch (e) {
    return {
      url,
      reachable: false,
      statusCode: null,
      latencyMs: Date.now() - t0,
      error: e?.name === "TimeoutError" ? "timeout" : e?.message || "unknown",
    };
  }
}

export async function detectSaveBuild(savePath) {
  // B42 stores chunks as map/X/Y.bin, B41 stores them as map_X_Y.bin in the save root.
  if (!(await safePathExists(savePath))) return "unknown";
  const mapDir = path.join(savePath, "map");
  if (await safePathExists(mapDir)) {
    const entries = await safeReaddir(mapDir);
    if (entries && entries.some((e) => /^\d+$/.test(e))) return "b42";
  }
  const rootEntries = await safeReaddir(savePath);
  if (rootEntries && rootEntries.some((e) => /^map_\d+_\d+\.bin$/.test(e)))
    return "b41";
  return "unknown";
}
