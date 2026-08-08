import express from "express";
import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Chunks");
import { sanitizeError } from "../../utils/sanitize.js";
import { requireRole } from "../../services/auth.js";
import { deleteVehiclesInBoxes } from "../../utils/vehiclesDb.js";
import { cellDivisorFor, tilesPerChunkFor } from "./geometry.js";
import { getZomboidDataPath, resolveSavesPath, resolveCustomOrDefaultDataPath } from "./savePaths.js";
import { cleanupEmptyCellFiles } from "./cellCleanup.js";
import { checkServerNotRunning } from "./serverRunningGuard.js";
import { buildRegionDeletionBoxes } from "./vehicleCleanup.js";
import { findChunksInRegion } from "./regionChunkFinder.js";

const router = express.Router();

function validateRegionBounds(minX, maxX, minY, maxY, res) {
  if (
    typeof minX !== "number" ||
    typeof maxX !== "number" ||
    typeof minY !== "number" ||
    typeof maxY !== "number" ||
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxY)
  ) {
    res.status(400).json({ error: "Region bounds must be finite numbers" });
    return false;
  }
  // Reject swapped bounds — otherwise a non-invert selection silently
  // matches nothing and the caller sees an unhelpful "0 deleted".
  if (minX > maxX || minY > maxY) {
    res
      .status(400)
      .json({ error: "Region bounds inverted (minX > maxX or minY > maxY)" });
    return false;
  }
  return true;
}

async function backupRegionChunks(
  zomboidDataPath,
  sanitizedSaveName,
  savePath,
  mapPath,
  chunksToDelete,
  region,
) {
  const backupPath = path.join(
    zomboidDataPath,
    "backups",
    `${sanitizedSaveName}_region_${Date.now()}`,
  );
  await fs.promises.mkdir(backupPath, { recursive: true });

  // Parallel backup
  await Promise.all(
    chunksToDelete.map(async (chunk) => {
      const srcFile =
        chunk.source === "saveroot"
          ? path.join(savePath, chunk.file)
          : path.join(mapPath, chunk.file);
      try {
        const backupName = `map_${chunk.file.replace(/[/\\]/g, "_")}`;
        await fs.promises.copyFile(
          srcFile,
          path.join(backupPath, backupName),
        );
      } catch (e) {
        // Ignore missing files or errors
      }
    }),
  );

  // Save region info
  await fs.promises.writeFile(
    path.join(backupPath, "region_info.json"),
    JSON.stringify(
      { ...region, chunksDeleted: chunksToDelete.length },
      null,
      2,
    ),
  );

  log.info(`Created region backup at ${backupPath}`);
  return backupPath;
}

async function deleteRegionChunkFiles(savePath, mapPath, chunksToDelete, regionCellDiv) {
  let deleted = 0;
  const touchedCells = new Set();

  await Promise.all(
    chunksToDelete.map(async (chunk) => {
      try {
        const chunkFile =
          chunk.source === "saveroot"
            ? path.join(savePath, chunk.file)
            : path.join(mapPath, chunk.file);
        await fs.promises.unlink(chunkFile);
        deleted++;
        touchedCells.add(
          `${Math.floor(chunk.x / regionCellDiv)},${Math.floor(chunk.y / regionCellDiv)}`,
        );
      } catch (err) {
        if (err.code !== "ENOENT")
          log.warn(`Failed to delete chunk ${chunk.file}: ${err.message}`);
      }
    }),
  );

  return { deleted, touchedCells };
}

async function cleanupEmptyRegionMapDirs(mapPath, chunksToDelete) {
  const deletedXDirs = new Set();
  for (const chunk of chunksToDelete) {
    const parts = chunk.file.split("/");
    if (parts.length === 2) deletedXDirs.add(parts[0]);
  }
  for (const xDir of deletedXDirs) {
    try {
      const xDirPath = path.join(mapPath, xDir);
      const remaining = await fs.promises.readdir(xDirPath);
      if (remaining.length === 0) await fs.promises.rmdir(xDirPath);
    } catch (e) {
      if (e.code !== "ENOENT")
        log.debug(`Failed to clean up empty dir ${xDir}: ${e.message}`);
    }
  }
}

// Delete chunks by region (x/y coordinate range)
router.post("/delete-region", requireRole("admin"), async (req, res) => {
  try {
    const {
      saveName,
      minX,
      maxX,
      minY,
      maxY,
      createBackup = true,
      invert = false,
      customPath = null,
      deleteVehicles = false,
      force = false,
    } = req.body;

    const guardResult = await checkServerNotRunning(
      req,
      force,
      "delete-region",
    );
    if (guardResult) return res.status(guardResult.status).json(guardResult.body);

    if (
      !saveName ||
      minX === undefined ||
      maxX === undefined ||
      minY === undefined ||
      maxY === undefined
    ) {
      return res
        .status(400)
        .json({ error: "Save name and region bounds required" });
    }

    // Sanitize saveName to prevent path traversal
    const sanitizedSaveName = path.basename(saveName);
    if (!sanitizedSaveName || sanitizedSaveName !== saveName) {
      return res.status(400).json({ error: "Invalid save name" });
    }

    if (!validateRegionBounds(minX, maxX, minY, maxY, res)) return;

    const zomboidDataPath = customPath
      ? resolveCustomOrDefaultDataPath(String(customPath))
      : await getZomboidDataPath();
    if (!zomboidDataPath) {
      return res.status(400).json({ error: "Zomboid data path not set" });
    }

    const savesPath = resolveSavesPath(zomboidDataPath);
    const savePath = path.join(savesPath, sanitizedSaveName);
    const mapPath = path.join(savePath, "map");

    if (!fs.existsSync(savePath)) {
      return res.status(404).json({ error: "Save not found" });
    }

    const { chunksToDelete, isB42: regionIsB42 } = await findChunksInRegion(
      savePath,
      mapPath,
      { minX, maxX, minY, maxY, invert },
    );

    if (chunksToDelete.length === 0) {
      return res.json({
        success: true,
        deleted: 0,
        message: "No chunks in selected region",
      });
    }

    // Safety limit to prevent accidental mass deletion
    if (chunksToDelete.length > 100000) {
      return res.status(400).json({
        error: `Region too large (${chunksToDelete.length.toLocaleString()} chunks). Maximum is 100,000 at a time.`,
      });
    }

    // Create backup if requested
    let backupPath = null;
    if (createBackup) {
      backupPath = await backupRegionChunks(
        zomboidDataPath,
        sanitizedSaveName,
        savePath,
        mapPath,
        chunksToDelete,
        { minX, maxX, minY, maxY, invert },
      );
    }

    // Delete chunks
    const regionCellDiv = cellDivisorFor(regionIsB42);
    const { deleted, touchedCells } = await deleteRegionChunkFiles(
      savePath,
      mapPath,
      chunksToDelete,
      regionCellDiv,
    );

    // Per-cell aux cleanup — only for cells that are now fully empty on disk.
    const cellCleanup = await cleanupEmptyCellFiles(
      savePath,
      touchedCells,
      regionIsB42,
      backupPath,
    );

    // Clean up empty X directories after B42 chunk deletion
    await cleanupEmptyRegionMapDirs(mapPath, chunksToDelete);

    // Vehicles.db cleanup (optional, destructive).
    // Backup lives inside the chunk backup folder (if one was made) so a
    // single restore operation covers everything from this call. Matches the
    // layout used by /delete-chunks.
    let vehiclesResult = { deleted: 0, skipped: true };
    if (deleteVehicles && deleted > 0) {
      const tilesPerChunk = tilesPerChunkFor(regionIsB42);
      const dbBackup =
        createBackup && typeof backupPath === "string"
          ? path.join(backupPath, "vehicles.db.bak")
          : null;
      const boxes = buildRegionDeletionBoxes(chunksToDelete, tilesPerChunk);
      try {
        vehiclesResult = await deleteVehiclesInBoxes(savePath, boxes, {
          backupPath: dbBackup,
        });
        log.info(
          `vehicles.db: removed ${vehiclesResult.deleted} rows from region`,
        );
      } catch (e) {
        log.warn(`vehicles.db region cleanup failed: ${e.message}`);
      }
    }

    log.info(
      `Deleted ${deleted} chunks in region [${minX},${minY}]-[${maxX},${maxY}] from ${sanitizedSaveName} (cell files removed: ${cellCleanup.removed.length}, vehicles: ${vehiclesResult.deleted})`,
    );

    res.json({
      success: true,
      deleted,
      vehiclesDeleted: vehiclesResult.deleted || 0,
      cellFilesRemoved: cellCleanup.removed.length,
      region: { minX, maxX, minY, maxY },
      inverted: invert,
    });
  } catch (error) {
    log.error(`Failed to delete region: ${error.message}`);
    res
      .status(error.statusCode || 500)
      .json({ error: sanitizeError(error.message) });
  }
});

export default router;
