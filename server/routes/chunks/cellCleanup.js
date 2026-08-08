import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Chunks");
import { cellDivisorFor } from "./geometry.js";

// Given the set of cells touched by a chunk-deletion pass, determine which
// cells are now FULLY empty (no surviving chunk files anywhere in the cell's
// chunk range) and delete the per-cell auxiliary files (chunkdata, zpop,
// metagrid, apop). If any chunk survives in the cell we leave the cell files
// intact — deleting them nukes state for up to 1023 neighbouring chunks and
// is what made vehicles, zombies and loot "come back" in older builds.
//
// Only handles the B42 map/X/Y.bin layout. For B41 flat layouts, cell files
// typically don't exist or aren't used the same way — we leave them alone to
// avoid clobbering unrelated saves.
//
// If backupPath is provided, each aux file is copied into it before deletion
// so a restore can rebuild the cell exactly. Without this, a "restore from
// backup" leaves the save with chunk files present but no cell metadata —
// PZ would regenerate the cell partially and we'd get inconsistent state.
export async function cleanupEmptyCellFiles(
  savePath,
  touchedCells,
  isB42,
  backupPath = null,
) {
  if (!isB42 || touchedCells.size === 0) return { removed: [] };
  const divisor = cellDivisorFor(true);
  const mapPath = path.join(savePath, "map");
  const removed = [];

  for (const key of touchedCells) {
    const [cellX, cellY] = key.split(",").map(Number);
    if (!Number.isInteger(cellX) || !Number.isInteger(cellY)) continue;

    // Check survivors: scan map/{X}/ for any *.bin whose Y falls in the cell's
    // chunk range [cellY*divisor, cellY*divisor+divisor).
    const minChunkX = cellX * divisor;
    const maxChunkX = minChunkX + divisor - 1;
    const minChunkY = cellY * divisor;
    const maxChunkY = minChunkY + divisor - 1;

    let hasSurvivor = false;
    for (let cx = minChunkX; cx <= maxChunkX && !hasSurvivor; cx++) {
      const xDir = path.join(mapPath, String(cx));
      let entries;
      try {
        entries = await fs.promises.readdir(xDir);
      } catch (e) {
        if (e.code === "ENOENT") continue;
        // On unexpected errors, assume survivor to stay safe.
        hasSurvivor = true;
        break;
      }
      for (const name of entries) {
        const m = name.match(/^(\d+)\.bin$/);
        if (!m) continue;
        const y = parseInt(m[1], 10);
        if (y >= minChunkY && y <= maxChunkY) {
          hasSurvivor = true;
          break;
        }
      }
    }

    if (hasSurvivor) continue;

    // Cell is empty on disk — safe to remove per-cell auxiliary files.
    const cellFiles = [
      ["chunkdata", `chunkdata_${cellX}_${cellY}.bin`],
      ["zpop", `zpop_${cellX}_${cellY}.bin`],
      ["metagrid", `metacell_${cellX}_${cellY}.bin`],
      ["apop", `apop_${cellX}_${cellY}.bin`],
    ];
    for (const [folder, file] of cellFiles) {
      const full = path.join(savePath, folder, file);
      try {
        // Back up before deletion if a backup folder was passed. Nested under
        // cellaux/ so the restore script can distinguish these from chunk
        // backups (which live at the top level of backupPath).
        if (backupPath) {
          try {
            const cellAuxDir = path.join(backupPath, "cellaux", folder);
            await fs.promises.mkdir(cellAuxDir, { recursive: true });
            await fs.promises.copyFile(full, path.join(cellAuxDir, file));
          } catch (cpErr) {
            if (cpErr.code !== "ENOENT") {
              log.debug(
                `Failed to back up cell aux ${folder}/${file}: ${cpErr.message}`,
              );
            }
          }
        }
        await fs.promises.unlink(full);
        removed.push(`${folder}/${file}`);
      } catch (e) {
        if (e.code !== "ENOENT") {
          log.debug(
            `Failed to delete cell file ${folder}/${file}: ${e.message}`,
          );
        }
      }
    }
  }
  return { removed };
}
