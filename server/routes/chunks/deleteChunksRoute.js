import express from "express";
import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Chunks");
import { sanitizeError } from "../../utils/sanitize.js";
import { requireRole } from "../../services/auth.js";
import { deleteVehiclesInBoxes } from "../../utils/vehiclesDb.js";
import { cellDivisorFor, tilesPerChunkFor, detectSaveIsB42Sync } from "./geometry.js";
import { getZomboidDataPath, resolveSavesPath, resolveCustomOrDefaultDataPath } from "./savePaths.js";
import { cleanupEmptyCellFiles } from "./cellCleanup.js";
import { checkServerNotRunning } from "./serverRunningGuard.js";
import { backupSelectedChunks } from "./chunkFileBackup.js";
import { buildChunkDeletionBoxes } from "./vehicleCleanup.js";

const router = express.Router();

function validateChunkList(chunks, res) {
  for (const chunk of chunks) {
    if (!chunk.file) {
      res.status(400).json({ error: "Invalid chunk file name" });
      return false;
    }
    const normalized = path.normalize(chunk.file);
    if (normalized.includes("..") || path.isAbsolute(normalized)) {
      res.status(400).json({ error: "Invalid chunk file path" });
      return false;
    }
    if (chunk.x !== undefined && chunk.x !== null) {
      const nx = Number(chunk.x);
      if (!Number.isFinite(nx) || !Number.isInteger(nx)) {
        res
          .status(400)
          .json({ error: "Invalid chunk x coordinate — must be an integer" });
        return false;
      }
      chunk.x = nx;
    }
    if (chunk.y !== undefined && chunk.y !== null) {
      const ny = Number(chunk.y);
      if (!Number.isFinite(ny) || !Number.isInteger(ny)) {
        res
          .status(400)
          .json({ error: "Invalid chunk y coordinate — must be an integer" });
        return false;
      }
      chunk.y = ny;
    }
  }
  return true;
}

// Backfill cell coordinates for chunkdata-origin and map-origin chunks.
// Use == null (not === undefined) so a null from the client JSON payload
// is also treated as "needs backfill" — otherwise touchedCells ends up
// with "null,null" keys and per-cell aux cleanup silently skips.
function backfillCellCoords(chunks, cellDivisor) {
  for (const chunk of chunks) {
    if (chunk.source === "chunkdata" && chunk.cellX == null) {
      const cdMatch = chunk.file.match(/(\d+)_(\d+)/);
      if (cdMatch) {
        chunk.cellX = parseInt(cdMatch[1], 10);
        chunk.cellY = parseInt(cdMatch[2], 10);
      }
    }
    if (chunk.cellX == null) chunk.cellX = Math.floor(chunk.x / cellDivisor);
    if (chunk.cellY == null) chunk.cellY = Math.floor(chunk.y / cellDivisor);
  }
}

async function deleteChunkFiles(savePath, chunks) {
  let deleted = 0;
  const errors = [];
  const touchedCells = new Set();

  const deleteResults = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        let wasDeleted = false;

        if (chunk.source === "chunkdata") {
          // Pure chunkdata entry (no map file) — delete the chunkdata file directly.
          // Use the ACTUAL filename captured by the scanner (it may be
          // `chunkdata_X_Y.bin` OR a bare `X_Y.bin` depending on save layout).
          const chunkDataFile = path.join(savePath, "chunkdata", chunk.file);
          try {
            await fs.promises.unlink(chunkDataFile);
            wasDeleted = true;
          } catch (e) {
            if (e.code !== "ENOENT")
              return {
                success: false,
                error: `chunkdata: ${e.message}`,
                file: chunk.file,
              };
          }
        } else {
          const mapFile =
            chunk.source === "saveroot"
              ? path.join(savePath, chunk.file)
              : path.join(savePath, "map", chunk.file);
          try {
            await fs.promises.unlink(mapFile);
            wasDeleted = true;
          } catch (e) {
            if (e.code !== "ENOENT")
              return {
                success: false,
                error: sanitizeError(e.message),
                file: chunk.file,
              };
          }
        }

        if (wasDeleted) {
          touchedCells.add(`${chunk.cellX},${chunk.cellY}`);
        }
        return { success: true, wasDeleted };
      } catch (err) {
        return {
          success: false,
          error: sanitizeError(err.message),
          file: chunk.file,
        };
      }
    }),
  );

  for (const r of deleteResults) {
    if (r.success) {
      if (r.wasDeleted) deleted++;
    } else errors.push(`${r.file}: ${r.error}`);
  }

  return { deleted, errors, touchedCells };
}

async function cleanupEmptyMapDirs(savePath, chunks) {
  const deletedXDirs = new Set();
  for (const chunk of chunks) {
    const parts = chunk.file.split("/");
    if (parts.length === 2) deletedXDirs.add(parts[0]);
  }
  for (const xDir of deletedXDirs) {
    try {
      const xPath = path.join(savePath, "map", xDir);
      const remaining = await fs.promises.readdir(xPath);
      if (remaining.length === 0) await fs.promises.rmdir(xPath);
    } catch (e) {
      /* ignore */
    }
  }
}

// Delete selected chunks
router.post("/delete-chunks", requireRole("admin"), async (req, res) => {
  try {
    const {
      saveName,
      chunks,
      createBackup = true,
      customPath = null,
      deleteVehicles = false,
      force = false,
    } = req.body;
    log.info(
      `POST /delete-chunks: saveName=${saveName}, chunkCount=${chunks?.length || 0}, createBackup=${createBackup}, deleteVehicles=${!!deleteVehicles}, force=${!!force}`,
    );

    const guardResult = await checkServerNotRunning(
      req,
      force,
      "delete-chunks",
    );
    if (guardResult) return res.status(guardResult.status).json(guardResult.body);

    if (!saveName || !chunks || !Array.isArray(chunks) || chunks.length === 0) {
      return res
        .status(400)
        .json({ error: "Save name and chunks array required" });
    }

    // Cap chunk count explicitly. Express body-parser already rejects >1MB
    // payloads with a cryptic PayloadTooLargeError; this check fires earlier
    // and gives a clear message. 100k matches the region endpoint's cap.
    if (chunks.length > 100000) {
      return res.status(400).json({
        error: `Too many chunks (${chunks.length.toLocaleString()}). Maximum is 100,000 per request — split into smaller batches.`,
      });
    }

    // Sanitize saveName to prevent path traversal
    const sanitizedSaveName = path.basename(saveName);
    if (!sanitizedSaveName || sanitizedSaveName !== saveName) {
      return res.status(400).json({ error: "Invalid save name" });
    }

    if (!validateChunkList(chunks, res)) return;

    const zomboidDataPath = customPath
      ? resolveCustomOrDefaultDataPath(String(customPath))
      : await getZomboidDataPath();
    if (!zomboidDataPath) {
      return res.status(400).json({ error: "Zomboid data path not set" });
    }

    const savesPath = resolveSavesPath(zomboidDataPath);
    const savePath = path.join(savesPath, sanitizedSaveName);

    if (!fs.existsSync(savePath)) {
      return res.status(404).json({ error: "Save not found" });
    }

    // B42 vs B41 detection — filesystem-based, not filename-based.
    // Filename inference (chunks.some(c => c.file.includes('/'))) silently
    // mis-detects selections made of only `chunkdata_X_Y.bin` entries on B42
    // saves. That would compute the wrong cell size and the wrong vehicle
    // bbox (30×10 B41 tiles vs 32×8 B42 tiles).
    const isB42 = detectSaveIsB42Sync(savePath);
    const cellDivisor = cellDivisorFor(isB42);
    const tilesPerChunk = tilesPerChunkFor(isB42);

    backfillCellCoords(chunks, cellDivisor);

    // Create backup if requested. We back up map files AND vehicles.db (if
    // vehicles are being deleted) so the operation is fully reversible.
    let backupPath = null;
    if (createBackup) {
      backupPath = await backupSelectedChunks(
        zomboidDataPath,
        sanitizedSaveName,
        savePath,
        chunks,
      );
    }

    // ─── Pass 1: delete the chunk files themselves ──────────────────────
    const { deleted, errors, touchedCells } = await deleteChunkFiles(
      savePath,
      chunks,
    );

    // ─── Pass 2: remove per-cell aux files only for cells that are now empty ───
    // (Fixes the overreach bug that made one chunk deletion wipe cell state
    // for 1023 innocent neighbours.)
    const cellCleanup = await cleanupEmptyCellFiles(
      savePath,
      touchedCells,
      isB42,
      backupPath,
    );

    // Clean up empty X directories (B42)
    await cleanupEmptyMapDirs(savePath, chunks);

    // ─── Pass 3: delete matching rows from vehicles.db ─────────────────
    // This is the critical fix for "cars come back when I return to the cell".
    // Runtime PanelBridge only touches loaded vehicles; the DB retains every
    // other one. We delete every vehicle whose world tile coords fall inside
    // one of the just-deleted chunks.
    let vehiclesResult = { deleted: 0, skipped: true };
    if (deleteVehicles && deleted > 0) {
      const dbBackup = backupPath
        ? path.join(backupPath, "vehicles.db.bak")
        : null;
      const boxes = buildChunkDeletionBoxes(chunks, cellDivisor, tilesPerChunk);
      try {
        vehiclesResult = await deleteVehiclesInBoxes(savePath, boxes, {
          backupPath: dbBackup,
        });
        log.info(`vehicles.db: removed ${vehiclesResult.deleted} rows`);
      } catch (e) {
        log.warn(`vehicles.db cleanup failed: ${e.message}`);
        errors.push(`vehicles.db: ${e.message}`);
      }
    }

    log.info(
      `Deleted ${deleted} chunks from save ${sanitizedSaveName} (cell aux files removed: ${cellCleanup.removed.length}, vehicles removed: ${vehiclesResult.deleted})`,
    );

    res.json({
      success: true,
      deleted,
      vehiclesDeleted: vehiclesResult.deleted || 0,
      cellFilesRemoved: cellCleanup.removed.length,
      errors: errors.length > 0 ? errors : undefined,
      backupCreated: createBackup,
    });
  } catch (error) {
    log.error(`Failed to delete chunks: ${error.message}`);
    res
      .status(error.statusCode || 500)
      .json({ error: sanitizeError(error.message) });
  }
});

export default router;
