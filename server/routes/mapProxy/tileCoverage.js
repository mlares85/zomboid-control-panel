import { PZ_MAP_ROOT } from "./b42Resolution.js";

const UA = "ZomboidControlPanel/1.0 (+https://github.com/fpsacha/zomboid-control-panel)";

// A brand-new PZ build's tiles can be listed as the "default" entry in
// build_list.json before map.projectzomboid.com has actually finished
// rendering full world coverage for it. Probing a few inhabited-area tiles
// lets us detect "listed but not rendered yet" and fall back to the previous
// build instead of showing an empty map.
//
// The probe coordinates are derived from the build's own geometry rather than
// hardcoded: a fixed `15/9_3.jpg`-style path is only meaningful for a
// TileSize=1024 build and silently false-negatives on a 2048 one, which would
// pin every install to an outdated build forever.
const COVERAGE_PROBE_FRACTIONS = [
  [0.51, 0.4],
  [0.56, 0.45],
  [0.61, 0.5],
];

export async function probeLevelHasCoverage(directory, geometry, level) {
  const levelScale = 2 ** (geometry.maxLevel - level);
  const levelW = Math.ceil(geometry.width / levelScale);
  const levelH = Math.ceil(geometry.height / levelScale);
  for (const [fx, fy] of COVERAGE_PROBE_FRACTIONS) {
    const col = Math.floor((levelW * fx) / geometry.tileSize);
    const row = Math.floor((levelH * fy) / geometry.tileSize);
    try {
      const resp = await fetch(
        `${PZ_MAP_ROOT}/maps/${directory}/base/layer0_files/${level}/${col}_${row}.jpg`,
        { method: "HEAD", signal: AbortSignal.timeout(4000), headers: { "User-Agent": UA } },
      );
      if (resp.ok) return true;
    } catch {
      // Treat as not-covered and try the next probe tile.
    }
  }
  return false;
}

export async function hasTileCoverage(directory, geometry) {
  return probeLevelHasCoverage(directory, geometry, Math.max(0, geometry.maxLevel - 6));
}

// geometry.maxLevel (fetchMapGeometry in b42Resolution.js) is
// Math.ceil(log2(max(width, height))) — the depth a FULL Deep Zoom pyramid
// would need for an image of that size, computed purely from the DZI
// descriptor's own dimensions. It is not evidence the tile host actually
// rendered that deep: level 21 at 1024px tiles is roughly 563,000 tiles for
// one floor, so real coverage falls well short and the client (WorldMap.tsx)
// was clamping to this inflated ceiling and requesting tiles that 404 across
// most of the map — see GH#109. hasTileCoverage() above already establishes,
// empirically, that maxLevel-6 is deep enough to find real tiles at these
// probe points; that's what gates picking this directory at all, so it's a
// known-good floor here, not a guess. Binary search the [maxLevel-6,
// maxLevel] gap (at most a handful of HEAD requests, same probe points, run
// once per directory resolve and cached alongside the rest of the geometry)
// for the deepest level any probe tile still resolves at, and report that as
// the depth a client should actually be allowed to zoom to.
export async function discoverRenderedMaxLevel(directory, geometry) {
  const floor = Math.max(0, geometry.maxLevel - 6); // known covered — hasTileCoverage just confirmed it
  let lo = floor;
  let hi = geometry.maxLevel;
  while (lo < hi) {
    const mid = lo + Math.ceil((hi - lo) / 2);
    if (await probeLevelHasCoverage(directory, geometry, mid)) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}
