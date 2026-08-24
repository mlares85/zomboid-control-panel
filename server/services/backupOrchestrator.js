import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import {
  compressToFormat,
  computeChecksum,
  verifyArchive,
  buildCompressionMetadata,
  isFormatAvailable,
} from "../utils/backupCompression.js";
import {
  scanDirectory,
  loadManifest,
  saveManifest,
  diffAgainstManifest,
  shouldRunFull,
  sumSizes,
  recordManifestAfterBackup,
  MANIFEST_FILENAME,
} from "../utils/backupIncremental.js";
import { getDestinationInstanceById } from "./backupDestinations/index.js";
import { addRecord } from "./backupRecords.js";
import { getActiveServer } from "../database/init.js";
import { captureServerSnapshot } from "../utils/serverSnapshot.js";
import bridge from "./panelBridge.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Backup:Orchestrator");
const DEFAULT_FULL_EVERY_N = 7;

function slugTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// Best-effort connected-player count via RCON. Not every caller (scheduled
// backups, tests) has an rconService handy, and the server may be stopped,
// so any failure just means the snapshot omits playerCount.
export async function resolvePlayerCount(rconService) {
  if (!rconService?.connected) return null;
  try {
    const result = await rconService.getPlayers();
    return result?.success ? result.players.length : null;
  } catch (error) {
    log.debug(`Could not resolve player count for snapshot: ${error.message}`);
    return null;
  }
}

// Best-effort world age via the PanelBridge mod. Only available while the PZ
// server is running with the mod loaded — otherwise this quietly omits it.
export async function resolveWorldAge() {
  try {
    const result = await bridge.getGameTime();
    const hours = result?.data?.worldAgeHours;
    return Number.isFinite(hours) ? `Day ${Math.floor(hours / 24)}` : null;
  } catch (error) {
    log.debug(`Could not resolve world age for snapshot: ${error.message}`);
    return null;
  }
}

export async function uploadToDestinations(destPath, fileName, destinationIds, defaultLocalPath) {
  const names = [];
  const errors = [];
  let remotePath = null;
  for (const id of destinationIds) {
    try {
      const { instance, record } = await getDestinationInstanceById(id, { defaultLocalPath });
      // "local" already sits at defaultLocalPath (that's where we just
      // compressed to) — uploading again would copy the file onto itself.
      const isDefaultLocal = id === "local" && instance.dir === defaultLocalPath;
      if (!isDefaultLocal) {
        const result = await instance.upload(destPath, fileName);
        if (result?.remotePath) remotePath = result.remotePath;
      }
      names.push(record.name);
    } catch (error) {
      log.error(`Upload to destination "${id}" failed: ${error.message}`);
      errors.push({ destinationId: id, message: error.message });
    }
  }
  return { names, remotePath, errors };
}

/**
 * Enhanced backup creation: picks full vs incremental, compresses with the
 * requested format, verifies + checksums the result, uploads to every
 * requested destination, and records rich metadata. `backupService` is only
 * used for its existing path-resolution methods (getSavesPath/getBackupsPath)
 * so this doesn't duplicate the active-server lookup logic already tested
 * there. Note: `includeDb` (embedding db.json in the archive) stays a
 * legacy-zip-only feature — see backupService.createBackup — to avoid
 * complicating the tar-based formats, which archive a single cwd-anchored
 * directory tree and can't cheaply splice in a file from elsewhere.
 */
export async function createEnhancedBackup(backupService, options = {}) {
  const format = options.format || "zip";
  const requestedType = options.type === "incremental" ? "incremental" : "full";
  const destinationIds = options.destinations?.length ? options.destinations : ["local"];
  const io = options.io;
  const emitProgress = (phase, percent, message) => {
    if (io) io.emit("backup:progress", { phase, percent, message });
  };

  if (!isFormatAvailable(format)) {
    throw new Error(`Backup format "${format}" is not available on this system.`);
  }

  const savesPath = await backupService.getSavesPath();
  const backupsPath = await backupService.getBackupsPath();
  if (!savesPath || !fs.existsSync(savesPath)) {
    throw new Error(
      savesPath ? `Saves folder not found: ${savesPath}` : "Could not determine saves folder path.",
    );
  }
  if (!backupsPath) throw new Error("Could not determine backups folder path");

  const activeServer = await getActiveServer();
  const serverName = activeServer?.serverName || "server";

  emitProgress("preparing", 5, "Scanning save files...");
  const manifestPath = path.join(backupsPath, MANIFEST_FILENAME);
  const manifest = loadManifest(manifestPath);
  const currentFiles = await scanDirectory(savesPath);

  const runFull = requestedType === "full" || shouldRunFull(manifest, DEFAULT_FULL_EVERY_N);
  const type = runFull ? "full" : "incremental";
  const diff = runFull ? null : diffAgainstManifest(currentFiles, manifest);
  const fileList = runFull ? undefined : diff.changed;
  const originalSize = runFull ? sumSizes(currentFiles) : sumSizes(currentFiles, fileList);

  const startTime = Date.now();
  const backupId = randomUUID();
  const fileName = `${serverName}_${type}_${slugTimestamp()}.${format}`;
  const destPath = path.join(backupsPath, fileName);

  emitProgress("archiving", 20, `Compressing (${type})...`);
  const { compressionTime, compressedSize } = await compressToFormat({
    sourceDir: savesPath,
    destPath,
    format,
    fileList,
    prefix: serverName,
  });

  emitProgress("finalizing", 80, "Verifying archive...");
  const checksum = await computeChecksum(destPath);
  const verifyResult = await verifyArchive(format, destPath);
  const metadata = buildCompressionMetadata({
    format,
    originalSize,
    compressedSize,
    compressionTime,
    checksum,
  });

  emitProgress("uploading", 88, "Uploading to destinations...");
  const uploadResults = await uploadToDestinations(destPath, fileName, destinationIds, backupsPath);

  const nextManifest = recordManifestAfterBackup(manifest, { backupId, type, currentFiles });
  saveManifest(manifestPath, nextManifest);

  const [playerCount, worldAge] = await Promise.all([
    resolvePlayerCount(options.rconService),
    resolveWorldAge(),
  ]);
  const serverSnapshot = await captureServerSnapshot({
    activeServer,
    playerCount,
    worldAge,
    saveSize: originalSize,
  });

  const record = await addRecord({
    id: backupId,
    ...metadata,
    type,
    verified: verifyResult.readable,
    serverName,
    destination:
      uploadResults.names.join(", ") ||
      (uploadResults.errors.length > 0 ? "none (all destinations failed)" : "local"),
    remotePath: uploadResults.remotePath,
    incrementalBase: runFull ? null : manifest.lastFullBackupId,
    changedFiles: runFull ? null : fileList.length,
    fileName,
    serverSnapshot,
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  emitProgress(
    "complete",
    100,
    `Backup complete (${metadata.compressionRatio} smaller, ${duration}s)`,
  );
  log.info(`Enhanced backup ${fileName} complete: ${type}, ${format}, ${metadata.compressionRatio} smaller`);
  if (uploadResults.errors.length > 0) {
    log.warn(
      `Backup ${fileName} completed but ${uploadResults.errors.length} destination upload(s) failed: ` +
        uploadResults.errors.map((e) => `${e.destinationId} (${e.message})`).join(", "),
    );
  }

  return {
    success: true,
    backup: record,
    duration: parseFloat(duration),
    destinationErrors: uploadResults.errors,
  };
}
