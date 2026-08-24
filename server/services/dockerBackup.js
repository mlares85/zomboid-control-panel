import path from "path";
import { randomUUID } from "crypto";
import { computeChecksum, verifyArchive, buildCompressionMetadata } from "../utils/backupCompression.js";
import { uploadToDestinations, resolvePlayerCount, resolveWorldAge } from "./backupOrchestrator.js";
import { addRecord } from "./backupRecords.js";
import { getActiveServer } from "../database/init.js";
import { captureServerSnapshot } from "../utils/serverSnapshot.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Backup:Docker");

// In-container paths set by dockerContainerFactory.js
const CONTAINER_SAVES_BASE = "/root/Zomboid/Saves/Multiplayer";

function slugTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/**
 * Create a backup of a Docker-managed server by streaming save files out of
 * the container via the Docker archive API. Always produces a tar.gz (Docker
 * returns raw tar, we gzip on the fly). Incremental is not supported — the
 * panel can't scan directory contents inside the container cheaply.
 */
export async function createDockerBackup(deps, options = {}) {
  const { dockerClient, backupService, io, rconService } = deps;
  const destinationIds = options.destinations?.length ? options.destinations : ["local"];
  const emitProgress = (phase, percent, message) => {
    if (io) io.emit("backup:progress", { phase, percent, message });
  };

  const activeServer = await getActiveServer();
  if (!activeServer?.dockerContainerId) {
    throw new Error("No Docker container ID found for the active server.");
  }

  const serverName = activeServer.serverName || "server";
  const containerId = activeServer.dockerContainerId;
  const containerSavesPath = `${CONTAINER_SAVES_BASE}/${serverName}`;

  const containerInfo = await dockerClient.inspectContainer(containerId);
  if (!containerInfo) {
    throw new Error(`Container ${containerId} not found. It may have been removed.`);
  }

  emitProgress("preparing", 5, "Preparing Docker backup...");

  const backupsPath = await backupService.getBackupsPath();
  if (!backupsPath) throw new Error("Could not determine backups folder path");

  const startTime = Date.now();
  const backupId = randomUUID();
  const fileName = `${serverName}_docker_${slugTimestamp()}.tar.gz`;
  const destPath = path.join(backupsPath, fileName);

  emitProgress("archiving", 20, "Streaming save files from container...");
  const archiveResult = await dockerClient.getArchive(
    containerId, containerSavesPath, destPath, { compress: true },
  );
  if (!archiveResult.success) {
    throw new Error(`Failed to archive container files: ${archiveResult.error}`);
  }

  emitProgress("finalizing", 80, "Verifying archive...");
  const checksum = await computeChecksum(destPath);
  const verifyResult = await verifyArchive("tar.gz", destPath);
  const compressionTime = Date.now() - startTime;
  const metadata = buildCompressionMetadata({
    format: "tar.gz",
    originalSize: archiveResult.size,
    compressedSize: archiveResult.size,
    compressionTime,
    checksum,
  });

  emitProgress("uploading", 88, "Uploading to destinations...");
  const uploadResults = await uploadToDestinations(
    destPath, fileName, destinationIds, backupsPath,
  );

  const [playerCount, worldAge] = await Promise.all([
    resolvePlayerCount(rconService),
    resolveWorldAge(),
  ]);
  const serverSnapshot = await captureServerSnapshot({
    activeServer, playerCount, worldAge, saveSize: archiveResult.size,
  });

  const record = await addRecord({
    id: backupId,
    ...metadata,
    type: "full",
    verified: verifyResult.readable,
    serverName,
    destination:
      uploadResults.names.join(", ") ||
      (uploadResults.errors.length > 0 ? "none (all destinations failed)" : "local"),
    remotePath: uploadResults.remotePath,
    incrementalBase: null,
    changedFiles: null,
    fileName,
    serverSnapshot,
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  emitProgress("complete", 100, `Docker backup complete (${duration}s)`);
  log.info(`Docker backup ${fileName} complete in ${duration}s`);
  if (uploadResults.errors.length > 0) {
    log.warn(
      `Docker backup ${fileName} completed but ${uploadResults.errors.length} destination(s) failed`,
    );
  }

  return {
    success: true,
    backup: record,
    duration: parseFloat(duration),
    destinationErrors: uploadResults.errors,
  };
}
