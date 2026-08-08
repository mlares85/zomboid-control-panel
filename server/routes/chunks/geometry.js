import fs from "fs";
import path from "path";

// B42: 1 cell = 32×32 chunks (256×256 tiles, 8 tiles/chunk).
// B41: 1 cell = 30×30 chunks (300×300 tiles, 10 tiles/chunk).
export function cellDivisorFor(isB42) {
  return isB42 ? 32 : 30;
}
export function tilesPerChunkFor(isB42) {
  return isB42 ? 8 : 10;
}

const B42_INDICATOR_FILES = [
  "WorldDictionary.bin",
  "global_mod_data.bin",
  "entity_data.bin",
];

// B42 saves have files like WorldDictionary.bin, global_mod_data.bin,
// entity_data.bin in the save root that B41 doesn't.
export function hasB42IndicatorFiles(savePath) {
  return B42_INDICATOR_FILES.some((f) => {
    try {
      return fs.existsSync(path.join(savePath, f));
    } catch {
      return false;
    }
  });
}

// Filesystem-based B42 detection. Much more reliable than inferring from a
// filename pattern because selections can be chunkdata-only (no `map/X/Y.bin`
// path, which would falsely look like B41). Order:
//   1. map/ contains numeric X subdirectories → B42 layout
//   2. B42 indicator files in save root (WorldDictionary.bin etc)
//   3. fall back to flat B41 layout
export function detectSaveIsB42Sync(savePath) {
  try {
    const mapPath = path.join(savePath, "map");
    if (fs.existsSync(mapPath)) {
      const entries = fs.readdirSync(mapPath, { withFileTypes: true });
      if (entries.some((e) => e.isDirectory() && /^\d+$/.test(e.name)))
        return true;
    }
  } catch {
    /* ignore */
  }
  return hasB42IndicatorFiles(savePath);
}
