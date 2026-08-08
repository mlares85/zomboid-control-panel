import { PZ_MAP_ROOT, getB42Dir, getB42TopFormat } from "../../../mapProxy.js";
import { diagFail, diagOk, diagWarn } from "../../diagHelpers.js";
import { probeTile } from "./probes.js";

// Probes B42/B41/B42-top-down tile CDN reachability. Returns the raw probe
// results so the caller can surface them in the response payload.
export async function checkTileSources(checks) {
  // ─── Tile sources ─────────────────────────────────────────────────
  // Probe the build and format the proxy actually resolves. A hardcoded
  // build/extension can report "reachable" while every real tile request
  // 404s, which is exactly how the top-down map broke silently.
  let b42Probe = null;
  let b41Probe = null;
  let b42TopProbe = null;
  let b42Dir = null;
  let b42TopFormat = null;
  try {
    b42Dir = await getB42Dir().catch(() => null);
    b42TopFormat = b42Dir ? await getB42TopFormat(b42Dir).catch(() => null) : null;
    [b42Probe, b41Probe, b42TopProbe] = await Promise.all([
      probeTile(
        `${PZ_MAP_ROOT}/maps/${b42Dir || "42.19.0"}/base/layer0_files/0/0_0.jpg`,
      ),
      probeTile(
        `${PZ_MAP_ROOT}/maps/41.78.16/base/layer0_files/0/0_0.jpg`,
      ),
      b42Dir && b42TopFormat
        ? probeTile(
            `${PZ_MAP_ROOT}/maps/${b42Dir}/base_top/layer0_files/10/0_0.${b42TopFormat}`,
          )
        : Promise.resolve(null),
    ]);

    if (b42Probe.reachable) {
      checks.push(
        diagOk(
          "worldmap.tiles.b42",
          "B42 tile CDN reachable",
          `Build ${b42Dir || "42.19.0"} responded in ${b42Probe.latencyMs} ms (HTTP ${b42Probe.statusCode}).`,
          { category: "worldmap" },
        ),
      );
    } else {
      checks.push(
        diagFail(
          "worldmap.tiles.b42",
          "B42 tile CDN unreachable",
          `Could not reach map.projectzomboid.com for B42 tiles (${b42Probe.error || `HTTP ${b42Probe.statusCode}`}). The B42 base map will not load.`,
          {
            category: "worldmap",
            hint: "Check the panel host's outbound HTTPS access. The /api/map/tiles proxy fetches tiles server-side.",
          },
        ),
      );
    }

    if (b41Probe.reachable) {
      checks.push(
        diagOk(
          "worldmap.tiles.b41",
          "B41 tile CDN reachable",
          `map.projectzomboid.com responded in ${b41Probe.latencyMs} ms (HTTP ${b41Probe.statusCode}).`,
          { category: "worldmap" },
        ),
      );
    } else {
      checks.push(
        diagWarn(
          "worldmap.tiles.b41",
          "B41 tile CDN unreachable",
          `Could not reach map.projectzomboid.com (${b41Probe.error || `HTTP ${b41Probe.statusCode}`}). B41 fallback tiles will not load.`,
          {
            category: "worldmap",
            hint: "Only relevant if you run a B41 server. Outbound HTTPS to map.projectzomboid.com is required.",
          },
        ),
      );
    }

    // The Chunk Cleaner uses the top-down render, which is published
    // separately from the isometric base and has changed image format
    // between builds. Probe it explicitly so a format/build mismatch is
    // reported instead of showing an empty map.
    if (b42TopProbe && b42TopProbe.reachable) {
      checks.push(
        diagOk(
          "worldmap.tiles.b42Top",
          "B42 top-down tiles reachable",
          `Build ${b42Dir} serves .${b42TopFormat} top-down tiles (HTTP ${b42TopProbe.statusCode}, ${b42TopProbe.latencyMs} ms).`,
          { category: "worldmap" },
        ),
      );
    } else if (b42TopProbe) {
      checks.push(
        diagFail(
          "worldmap.tiles.b42Top",
          "B42 top-down tiles unavailable",
          `Build ${b42Dir} did not serve a .${b42TopFormat} top-down tile (${b42TopProbe.error || `HTTP ${b42TopProbe.statusCode}`}). The Map Cleanup page will show chunks with no base map.`,
          {
            category: "worldmap",
            hint: "Upstream may have republished this build in a different image format. Re-run diagnostics after a few minutes; the panel re-reads the format from base_top/layer0.dzi every 24h or on restart.",
          },
        ),
      );
    } else {
      checks.push(
        diagWarn(
          "worldmap.tiles.b42Top",
          "B42 top-down format unresolved",
          "Could not read base_top/layer0.dzi to determine the top-down tile format.",
          {
            category: "worldmap",
            hint: "Check outbound HTTPS access from the panel host.",
          },
        ),
      );
    }

    // Node 18+ AbortSignal.timeout availability
    if (
      typeof AbortSignal === "undefined" ||
      typeof AbortSignal.timeout !== "function"
    ) {
      checks.push(
        diagFail(
          "worldmap.runtime",
          "Tile proxy needs Node 18+",
          "AbortSignal.timeout is unavailable on this runtime. Every tile fetch will throw and return 502.",
          {
            category: "worldmap",
            hint: "Upgrade the panel host to Node 18+ (the bundled .exe already ships with this).",
          },
        ),
      );
    }
  } catch (e) {
    checks.push(
      diagWarn(
        "worldmap.tiles.error",
        "Tile reachability probe failed",
        `Tile probe could not complete: ${e?.message || "unknown"}`,
        { category: "worldmap" },
      ),
    );
  }

  return { b42Probe, b41Probe };
}
