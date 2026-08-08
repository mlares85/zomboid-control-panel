import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Chunks");

// Back up the map/chunkdata files for a set of selected chunks before
// /delete-chunks removes them. We back up map files AND (if present)
// chunkdata files so the operation is fully reversible. Returns the backup
// directory path.
export async function backupSelectedChunks(
  zomboidDataPath,
  sanitizedSaveName,
  savePath,
  chunks,
) {
  const backupPath = path.join(
    zomboidDataPath,
    "backups",
    `${sanitizedSaveName}_chunks_${Date.now()}`,
  );
  await fs.promises.mkdir(backupPath, { recursive: true });

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        // Use source as a prefix so a B42 map chunk (`0/0.bin`) and a B41
        // save-root chunk (`0_0.bin`) can coexist in the same backup without
        // colliding to `map_0_0.bin` + EEXIST (which COPYFILE_EXCL would
        // otherwise silently drop as a warn).
        const srcTag =
          chunk.source === "saveroot"
            ? "saveroot"
            : chunk.source === "chunkdata"
              ? "chunkdata"
              : "map";
        const mapFile =
          chunk.source === "saveroot"
            ? path.join(savePath, chunk.file)
            : path.join(savePath, "map", chunk.file);
        try {
          const backupName = `${srcTag}_${chunk.file.replace(/[/\\]/g, "_")}`;
          await fs.promises.copyFile(
            mapFile,
            path.join(backupPath, backupName),
            fs.constants.COPYFILE_EXCL,
          );
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
        if (chunk.source === "chunkdata") {
          const chunkDataFile = path.join(savePath, "chunkdata", chunk.file);
          try {
            const backupName = `chunkdata_${chunk.file.replace(/[/\\]/g, "_")}`;
            await fs.promises.copyFile(
              chunkDataFile,
              path.join(backupPath, backupName),
              fs.constants.COPYFILE_EXCL,
            );
          } catch (e) {
            if (e.code !== "ENOENT") throw e;
          }
        }
      } catch (e) {
        log.warn(`Failed to backup chunk ${chunk.file}: ${e.message}`);
      }
    }),
  );

  log.info(`Created chunk backup at ${backupPath}`);
  return backupPath;
}
