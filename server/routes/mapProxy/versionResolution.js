import { createLogger } from "../../utils/logger.js";
import { PZ_MAP_ROOT } from "./b42Resolution.js";

const log = createLogger("API:MapProxy");
const UA = "ZomboidControlPanel/1.0 (+https://github.com/fpsacha/zomboid-control-panel)";

// Cache resolved geometry per version — each build's DZI never changes.
const versionCache = new Map();

async function fetchGeometry(directory) {
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
    };
  } catch {
    return null;
  }
}

async function fetchProjection(directory) {
  try {
    const resp = await fetch(
      `${PZ_MAP_ROOT}/maps/${directory}/base/map_info.json`,
      { signal: AbortSignal.timeout(5000), headers: { "User-Agent": UA } },
    );
    if (!resp.ok) return {};
    const info = await resp.json();
    const x0 = Number(info?.x0);
    const y0 = Number(info?.y0);
    const sqr = Number(info?.sqr);
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !sqr) return {};
    const skip = Number(info?.skip);
    return { x0, y0, sqr, scale: 1 << (Number.isFinite(skip) ? skip : 0) };
  } catch {
    return {};
  }
}

// Resolve geometry + projection for any version directory.
export async function fetchMapForVersion(directory) {
  if (!/^[\w.\-]+$/.test(directory)) {
    throw new Error(`Invalid version directory: ${directory}`);
  }
  if (versionCache.has(directory)) return versionCache.get(directory);

  const geometry = await fetchGeometry(directory);
  if (!geometry) {
    log.warn(`Map version ${directory} has no readable layer0.dzi`);
    throw new Error(`Map version ${directory} not available`);
  }
  const projection = await fetchProjection(directory);
  const result = { directory, ...geometry, ...projection };
  versionCache.set(directory, result);
  return result;
}
