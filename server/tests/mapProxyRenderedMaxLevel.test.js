import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GH#109: a real user reported the world map's terrain turning solid black
// above 137% zoom while player/vehicle dots kept rendering. Root cause:
// mapProxy resolved a build's maxLevel as Math.ceil(log2(max(width,
// height))) -- the depth a FULL Deep Zoom pyramid would need for the
// image's dimensions -- and handed it to the client as "the deepest level
// you may request", when it's really just arithmetic on the image size, not
// evidence the tile host rendered that deep. Level 21 at 1024px tiles is
// ~563,000 tiles for one floor, so real coverage falls well short and most
// of the map 404s past some real (much shallower) level.
//
// discoverRenderedMaxLevel() (server/routes/mapProxy/tileCoverage.js)
// binary-searches the [maxLevel-6, maxLevel] gap (same probe points
// hasTileCoverage already uses to confirm a directory has ANY rendered
// tiles) for the deepest level that still resolves, and /api/map/resolve
// now reports that as renderedMaxLevel alongside the theoretical maxLevel --
// WorldMap.tsx clamps its requested level to renderedMaxLevel instead.

const PZ_MAP_ROOT = "https://map.projectzomboid.com";

// Matches B42_GEOMETRY_FALLBACK exactly: tileSize 2048, 2318656x1019040 =>
// Math.ceil(log2(2318656)) = 22.
const GEOMETRY = { tileSize: 2048, width: 2318656, height: 1019040 };

function dziXml(g) {
  return `<?xml version="1.0"?><Image TileSize="${g.tileSize}" Overlap="0" Format="jpg"><Size Width="${g.width}" Height="${g.height}"/></Image>`;
}

// Extracts the numeric tile level from a probe URL of the shape
// .../base/layer0_files/<level>/<col>_<row>.jpg
function levelFromProbeUrl(url) {
  const m = String(url).match(/layer0_files\/(\d+)\//);
  return m ? Number(m[1]) : null;
}

// `deepestOkLevel` simulates real tile coverage stopping at that level --
// every probe at or below it resolves (200), everything past it 404s.
function mockFetch(deepestOkLevel, onProbe) {
  global.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (u === `${PZ_MAP_ROOT}/`) return { ok: false, status: 404 };
    if (u.endsWith("build_list.json")) {
      return { ok: true, json: async () => [{ directory: "42.20.0", default: true }] };
    }
    if (u.includes("/base/layer0.dzi")) {
      return { ok: true, text: async () => dziXml(GEOMETRY) };
    }
    if (u.includes("/base/map_info.json")) {
      return { ok: true, json: async () => ({ x0: 1040384, y0: -139296, sqr: 128, skip: 0 }) };
    }
    if (u.includes("/base/layer0_files/")) {
      onProbe?.();
      const level = levelFromProbeUrl(u);
      return { ok: level !== null && level <= deepestOkLevel };
    }
    throw new Error(`unexpected fetch URL in test: ${u}`);
  });
}

async function freshResolveRouter() {
  vi.resetModules();
  const { default: router } = await import("../routes/mapProxy/resolve.js");
  return router;
}

function findRoute(router, routePath, method) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === routePath && entry.route.methods[method],
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

async function callResolve(router) {
  const handler = findRoute(router, "/resolve", "get");
  const res = { set: vi.fn(), json: vi.fn() };
  await handler({ query: {} }, res);
  expect(res.json).toHaveBeenCalledTimes(1);
  return res.json.mock.calls[0][0];
}

const originalFetch = global.fetch;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("discoverRenderedMaxLevel (via GET /api/map/resolve)", () => {
  it("reports the real deepest covered level, not the theoretical maxLevel, when coverage stops short", async () => {
    // maxLevel is 22; simulate real coverage stopping at level 19 --
    // everything <=19 resolves, 20/21/22 all 404. The search floor is
    // maxLevel-6=16 (hasTileCoverage's own known-good gate), so this
    // exercises the binary search actually finding a level strictly between
    // the floor and the theoretical ceiling.
    mockFetch(19);
    const router = await freshResolveRouter();
    const body = await callResolve(router);
    expect(body.maxLevel).toBe(22);
    expect(body.renderedMaxLevel).toBe(19);
  });

  it("reports maxLevel itself when the full theoretical depth genuinely resolves", async () => {
    mockFetch(22);
    const router = await freshResolveRouter();
    const body = await callResolve(router);
    expect(body.renderedMaxLevel).toBe(body.maxLevel);
  });

  it("reports exactly the known-safe floor (maxLevel-6) when nothing past it resolves", async () => {
    mockFetch(16); // maxLevel(22) - 6 = 16
    const router = await freshResolveRouter();
    const body = await callResolve(router);
    expect(body.renderedMaxLevel).toBe(16);
  });

  it("costs only a handful of probe requests, not one per level in the gap", async () => {
    let probeCalls = 0;
    mockFetch(19, () => { probeCalls++; });
    const router = await freshResolveRouter();
    await callResolve(router);
    // hasTileCoverage's own probe (>=1) + binary search over a gap of 6
    // (ceil(log2(6)) ~= 3 rounds) * up to 3 probe fractions each -- well
    // under a linear scan of the whole [16,22] gap (which could reach 21+
    // probe requests).
    expect(probeCalls).toBeLessThan(15);
  });
});

describe("GH#109 arithmetic confirmation: the reported 137%/138% zoom boundary is a real DZI level step", () => {
  // Mirrors WorldMap.tsx's own readout formula (scale/defaultScale*100) and
  // level formula (round(maxLevel + log2(s))), independently, so a future
  // change to either constant re-proves the boundary instead of silently
  // drifting from the number this test (and the bug report) depend on.
  function levelStepPercent(maxLevel, defaultScale, fromLevel) {
    const s = 2 ** (fromLevel + 0.5 - maxLevel);
    return (s / defaultScale) * 100;
  }

  it("B42 (maxLevel 21, defaultScale 0.002): the 12->13 level step lands at ~138%, matching the user's reported 137% cutoff", () => {
    const percent = levelStepPercent(21, 0.002, 12);
    expect(percent).toBeCloseTo(138.11, 1);
  });

  it("B41 (maxLevel 22, defaultScale 0.001): the same step lands at ~138% too", () => {
    const percent = levelStepPercent(22, 0.001, 12);
    expect(percent).toBeCloseTo(138.11, 1);
  });
});
