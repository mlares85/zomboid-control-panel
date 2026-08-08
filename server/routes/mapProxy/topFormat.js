import { PZ_MAP_ROOT } from "./b42Resolution.js";

// The top-down (base_top) view is rendered separately from the isometric base
// and does not use the same image format across builds: 42.19.0 publishes webp
// while 42.20.0 publishes jpg. Requesting the wrong extension is a hard 404, so
// read the format from the build's own base_top descriptor.
const TOP_FORMAT_FALLBACK = "jpg";
export const TOP_CONTENT_TYPES = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};
const _topFormatCache = new Map(); // directory -> format

export async function getB42TopFormat(directory) {
  const cached = _topFormatCache.get(directory);
  if (cached) return cached;
  try {
    const resp = await fetch(
      `${PZ_MAP_ROOT}/maps/${directory}/base_top/layer0.dzi`,
      {
        signal: AbortSignal.timeout(5000),
        headers: {
          "User-Agent":
            "ZomboidControlPanel/1.0 (+https://github.com/fpsacha/zomboid-control-panel)",
        },
      },
    );
    if (resp.ok) {
      const xml = await resp.text();
      const format = xml.match(/Format="(\w+)"/)?.[1]?.toLowerCase();
      if (format && TOP_CONTENT_TYPES[format]) {
        _topFormatCache.set(directory, format);
        return format;
      }
    }
  } catch {
    // Fall through to the default below.
  }
  return TOP_FORMAT_FALLBACK;
}
