import fs from "fs";
import path from "path";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Chunks");

export async function getDirSize(dirPath) {
  let totalSize = 0;
  try {
    const files = await fs.promises.readdir(dirPath, { withFileTypes: true });

    const promises = files.map(async (file) => {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        return getDirSize(filePath);
      } else {
        try {
          const stats = await fs.promises.stat(filePath);
          return stats.size;
        } catch (e) {
          return 0;
        }
      }
    });
    const sizes = await Promise.all(promises);
    totalSize = sizes.reduce((a, b) => a + b, 0);
  } catch (err) {
    if (err.code !== "EACCES" && err.code !== "ENOENT")
      log.debug(`getDirSize error for ${dirPath}: ${err.message}`);
  }
  return totalSize;
}

// Count files recursively (handles B42's subdirectory structure)
// Uses parallel I/O for speed on large saves with many chunk directories.
export async function countFiles(dirPath) {
  let count = 0;
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const subdirPromises = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        subdirPromises.push(countFiles(path.join(dirPath, entry.name)));
      } else {
        count++;
      }
    }
    if (subdirPromises.length > 0) {
      const subCounts = await Promise.all(subdirPromises);
      count += subCounts.reduce((a, b) => a + b, 0);
    }
  } catch (err) {
    if (err.code !== "EACCES" && err.code !== "ENOENT")
      log.debug(`countFiles error for ${dirPath}: ${err.message}`);
  }
  return count;
}

export function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
