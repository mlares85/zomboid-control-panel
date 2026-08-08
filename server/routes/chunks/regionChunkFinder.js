import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Chunks");

// Find all chunk files whose coordinates fall inside (or, if `invert`,
// outside) the given region. Handles the B42 map/{X}/{Y}.bin layout, the
// legacy flat map/ layout, and the B41 save-root fallback. Returns the list
// of matching chunks plus whether the save uses the B42 layout (needed by
// the caller for cell-aux cleanup and vehicle tile-size math).
export async function findChunksInRegion(savePath, mapPath, region) {
  const mapExists = fs.existsSync(mapPath);
  const chunksToDelete = [];
  let mapContents = [];
  let xDirs = [];

  if (mapExists) {
    mapContents = await fs.promises.readdir(mapPath, { withFileTypes: true });
    xDirs = mapContents.filter((d) => d.isDirectory() && /^\d+$/.test(d.name));
  }

  if (xDirs.length > 0) {
    await scanB42RegionDirs(mapPath, xDirs, region, chunksToDelete);
  } else {
    scanLegacyRegionFiles(mapContents, region, chunksToDelete);
    if (chunksToDelete.length === 0) {
      await scanRootRegionFallback(savePath, region, chunksToDelete);
    }
  }

  return { chunksToDelete, isB42: xDirs.length > 0 };
}

async function scanB42RegionDirs(mapPath, xDirs, region, chunksToDelete) {
  const { minX, maxX, minY, maxY, invert } = region;
  // B42 structure: map/{X}/{Y}.bin
  await Promise.all(
    xDirs.map(async (xDir) => {
      const x = parseInt(xDir.name, 10);
      // Quick AABB check: if entire X row is out of X bounds, skip it
      if (!invert && (x < minX || x > maxX)) return;

      const xPath = path.join(mapPath, xDir.name);

      try {
        const yFiles = await fs.promises.readdir(xPath);
        const binFiles = yFiles.filter((f) => f.endsWith(".bin"));

        for (const yFile of binFiles) {
          const yMatch = yFile.match(/^(\d+)\.bin$/);
          if (yMatch) {
            const y = parseInt(yMatch[1], 10);

            const inRegion = x >= minX && x <= maxX && y >= minY && y <= maxY;
            const shouldDelete = invert ? !inRegion : inRegion;

            if (shouldDelete) {
              chunksToDelete.push({ file: `${x}/${yFile}`, x, y });
            }
          }
        }
      } catch (err) {
        log.warn(`Error reading chunk directory ${xPath}: ${err.message}`);
      }
    }),
  );
}

function scanLegacyRegionFiles(mapContents, region, chunksToDelete) {
  const { minX, maxX, minY, maxY, invert } = region;
  // Legacy flat file structure in map/ directory
  const files = mapContents
    .filter((f) => f.isFile() && f.name.endsWith(".bin"))
    .map((f) => f.name);

  for (const file of files) {
    const match = file.match(
      /(?:map_|chunkdata_|chunk_)?(\d+)_(\d+)(?:_\d+)?\.bin$/i,
    );
    if (match) {
      const x = parseInt(match[1], 10);
      const y = parseInt(match[2], 10);

      const inRegion = x >= minX && x <= maxX && y >= minY && y <= maxY;
      const shouldDelete = invert ? !inRegion : inRegion;

      if (shouldDelete) {
        chunksToDelete.push({ file, x, y });
      }
    }
  }
}

async function scanRootRegionFallback(savePath, region, chunksToDelete) {
  const { minX, maxX, minY, maxY, invert } = region;
  // B41 save-root fallback: check for map_X_Y.bin in save root
  const B41_CHUNK_REGEX = /^map_(\d+)_(\d+)\.bin$/i;
  const rootEntries = await fs.promises.readdir(savePath, {
    withFileTypes: true,
  });
  const rootBinFiles = rootEntries.filter(
    (f) => f.isFile() && B41_CHUNK_REGEX.test(f.name),
  );

  for (const entry of rootBinFiles) {
    const match = entry.name.match(B41_CHUNK_REGEX);
    if (match) {
      const x = parseInt(match[1], 10);
      const y = parseInt(match[2], 10);

      const inRegion = x >= minX && x <= maxX && y >= minY && y <= maxY;
      const shouldDelete = invert ? !inRegion : inRegion;

      if (shouldDelete) {
        chunksToDelete.push({
          file: entry.name,
          x,
          y,
          source: "saveroot",
        });
      }
    }
  }
}
