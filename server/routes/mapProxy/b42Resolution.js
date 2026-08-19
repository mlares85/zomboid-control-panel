import { createLogger } from "../../utils/logger.js";

const log = createLogger("API:MapProxy");

// ─── B42 map version resolution ──────────────────────────────────────────────
// Tiles are served at https://map.projectzomboid.com/maps/<version>/base/...
// build_list.json moved under the versioned static root (e.g.
// /static_20260803224102/build_list.json) so we discover that root from the
// homepage HTML and cache it. Tiles themselves are still at /maps/.
export const PZ_MAP_ROOT = "https://map.projectzomboid.com";
const B42_DIR_FALLBACK = "42.20.0";
let B42_DIR_TTL_MS = 24 * 60 * 60 * 1000; // re-resolve at most once per 24 h
const B42_DIR_RETRY_MS = 5 * 60 * 1000; // ...but retry a failed resolve sooner

/** Allow the MapVersionChecker service to adjust the TTL dynamically. */
export function setResolutionTtl(ms) {
  B42_DIR_TTL_MS = Math.max(B42_DIR_RETRY_MS + 1000, ms);
}

/** Expose internal cache state for diagnostics and the settings UI. */
export function getResolutionState() {
  return {
    currentDirectory: _b42Map?.directory || null,
    ttlMs: B42_DIR_TTL_MS,
    lastResolvedAt: _b42DirFetchedAt || null,
    nextResolveAt: _b42DirFetchedAt ? _b42DirFetchedAt + B42_DIR_TTL_MS : null,
    geometry: _b42Map
      ? {
          tileSize: _b42Map.tileSize,
          width: _b42Map.width,
          height: _b42Map.height,
          maxLevel: _b42Map.maxLevel,
        }
      : null,
  };
}

/** Force an immediate re-resolve on the next getB42Map() call. */
export function invalidateResolutionCache() {
  _b42DirFetchedAt = 0;
}
// Geometry of B42_DIR_FALLBACK, used only when layer0.dzi can't be fetched.
// x0/y0/sqr/scale are the isometric projection origin from the build's own
// base/map_info.json (skip:0 => scale 1<<0 = 1).
const B42_GEOMETRY_FALLBACK = {
  tileSize: 2048,
  width: 2318656,
  height: 1019040,
  maxLevel: 22,
  x0: 1040384,
  y0: -139296,
  sqr: 128,
  scale: 1,
};

// ─── Static root discovery ──────────────────────────────────────────────────
// build_list.json lives under a deploy-timestamped path (e.g.
// /static_20260803224102/build_list.json). Discover it from the homepage's
// __PZMAP_STATIC_ROOT assignment and cache it for 24h.
const UA = "ZomboidControlPanel/1.0 (+https://github.com/fpsacha/zomboid-control-panel)";
let _staticRoot = null;
let _staticRootFetchedAt = 0;
const STATIC_ROOT_TTL_MS = 24 * 60 * 60 * 1000;

async function discoverStaticRoot() {
  const now = Date.now();
  if (_staticRoot && now - _staticRootFetchedAt < STATIC_ROOT_TTL_MS) return _staticRoot;
  try {
    const resp = await fetch(PZ_MAP_ROOT + "/", {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": UA },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    const match = html.match(/__PZMAP_STATIC_ROOT\s*=\s*'([^']+)'/);
    if (!match) throw new Error("__PZMAP_STATIC_ROOT not found in HTML");
    _staticRoot = match[1].endsWith("/") ? match[1] : match[1] + "/";
    _staticRootFetchedAt = now;
    log.info(`Discovered static root: ${_staticRoot}`);
    return _staticRoot;
  } catch (err) {
    log.warn(`Failed to discover static root: ${err.message}`);
    return _staticRoot || "static/";
  }
}

async function fetchBuildList() {
  const root = await discoverStaticRoot();
  const url = `${PZ_MAP_ROOT}/${root}build_list.json`;
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: { "User-Agent": UA },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  return resp.json();
}

// The projection origin is NOT derivable from the image dimensions: 42.20.0 is
// exactly 2x the height of 42.19.0 but 4032 px wider, because the renderer
// crops/pads each build independently. map.projectzomboid.com publishes the
// real origin per build in base/map_info.json and its own viewer projects with
//   imageX = (x0 + (sx - sy) * sqr / 2) / scale
//   imageY = (y0 + (sx + sy) * sqr / 4) / scale
// where scale = 1 << skip. Scaling a previous build's origin by the width
// ratio instead puts markers ~2300 px (~36 tiles) west of where they are.
async function fetchMapProjection(directory) {
  try {
    const resp = await fetch(
      `${PZ_MAP_ROOT}/maps/${directory}/base/map_info.json`,
      { signal: AbortSignal.timeout(5000), headers: { "User-Agent": UA } },
    );
    if (!resp.ok) return null;
    const info = await resp.json();
    const x0 = Number(info?.x0);
    const y0 = Number(info?.y0);
    const sqr = Number(info?.sqr);
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !sqr) return null;
    const skip = Number(info?.skip);
    return { x0, y0, sqr, scale: 1 << (Number.isFinite(skip) ? skip : 0) };
  } catch {
    return null;
  }
}
// Map builds are not all rendered at the same resolution: 42.19.0 is
// TileSize=1024 / 1157312x509520, while 42.20.0 doubled to TileSize=2048 /
// 2318656x1019040. Nothing about the geometry can be assumed, so read it from
// the build's own DZI descriptor and hand it to the client.
async function fetchMapGeometry(directory) {
  try {
    const resp = await fetch(
      `${PZ_MAP_ROOT}/maps/${directory}/base/layer0.dzi`,
      { signal: AbortSignal.timeout(5000), headers: { "User-Agent": UA } },
    );
    if (!resp.ok) return null;
    const xml = await resp.text();
    const tileSize = Number(xml.match(/TileSize="(\d+)"/)?.[1]);
    const width = Number(xml.match(/Width="(\d+)"/)?.[1]);
    const height = Number(xml.match(/Height="(\d+)"/)?.[1]);
    if (!tileSize || !width || !height) return null;
    return {
      tileSize,
      width,
      height,
      maxLevel: Math.ceil(Math.log2(Math.max(width, height))),
      ...((await fetchMapProjection(directory)) || {}),
    };
  } catch {
    return null;
  }
}

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
let _b42Map = null;
let _b42DirFetchedAt = 0;

async function hasTileCoverage(directory, geometry) {
  const level = Math.max(0, geometry.maxLevel - 6);
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

export async function getB42Map() {
  const now = Date.now();
  if (_b42Map && now - _b42DirFetchedAt < B42_DIR_TTL_MS) {
    return _b42Map;
  }
  try {
    const list = await fetchBuildList();
    // Entries are ordered newest-first. Walk B42+ candidates until one
    // actually has rendered tile coverage, not just a build_list.json entry.
    // The full string (not just a prefix) must match a plain version
    // pattern — this now also becomes a disk cache path segment, so a
    // malformed/adversarial value from upstream must never reach fs calls.
    const candidates = Array.isArray(list)
      ? list.filter((e) => /^4[2-9][\w.\-]*$/.test(e.directory || ""))
      : [];
    for (const entry of candidates) {
      if (!entry?.directory) continue;
      const geometry = await fetchMapGeometry(entry.directory);
      if (!geometry) {
        log.warn(
          `B42 map directory ${entry.directory} has no readable layer0.dzi — trying older build.`,
        );
        continue;
      }
      if (await hasTileCoverage(entry.directory, geometry)) {
        if (_b42Map?.directory !== entry.directory) {
          log.info(
            `B42 map directory resolved: ${entry.directory} (${geometry.width}x${geometry.height}, tile ${geometry.tileSize}, max level ${geometry.maxLevel})`,
          );
        }
        _b42Map = { directory: entry.directory, ...geometry };
        _b42DirFetchedAt = now;
        return _b42Map;
      }
      log.warn(
        `B42 map directory ${entry.directory} listed but has no rendered tile coverage yet — trying older build.`,
      );
    }
  } catch (err) {
    log.warn(
      `Failed to resolve B42 map directory from build_list.json: ${err.message}. Falling back to ${_b42Map?.directory || B42_DIR_FALLBACK}.`,
    );
  }
  _b42Map = _b42Map || { directory: B42_DIR_FALLBACK, ...B42_GEOMETRY_FALLBACK };
  // Stamp the fallback too, not just a successful resolve — otherwise a
  // backend that can never reach map.projectzomboid.com (e.g. a blocked
  // cluster egress policy) eats the full fetch timeout on every single tile
  // request forever. Retry sooner than a successful resolve so a transient
  // upstream outage doesn't pin us to the fallback build for a whole day.
  _b42DirFetchedAt = now - B42_DIR_TTL_MS + B42_DIR_RETRY_MS;
  return _b42Map;
}

export async function getB42Dir() {
  return (await getB42Map()).directory;
}

// Expose the full version list to the frontend for version selection.
// Cached alongside the static root (24h TTL).
let _cachedVersions = null;
let _versionsFetchedAt = 0;

export async function getMapVersions() {
  const now = Date.now();
  if (_cachedVersions && now - _versionsFetchedAt < B42_DIR_TTL_MS) {
    return _cachedVersions;
  }
  try {
    const list = await fetchBuildList();
    _cachedVersions = Array.isArray(list)
      ? list
          .filter((e) => e?.directory && /^[\w.\-]+$/.test(e.directory))
          .map((e) => ({
            directory: e.directory,
            label: e.label || e.directory,
            isDefault: !!e.default,
          }))
      : [];
    _versionsFetchedAt = now;
    return _cachedVersions;
  } catch (err) {
    log.warn(`Failed to fetch map versions: ${err.message}`);
    return _cachedVersions || [];
  }
}
