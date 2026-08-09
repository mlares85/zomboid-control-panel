import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createWriteStream, createReadStream } from "fs";
import archiver from "archiver";
import {
  createTarGz,
  listTarGz,
  createTarZst,
  isZstdAvailable,
  verifyTarZst,
} from "./tarArchive.js";

// Dynamic import for unzipper (CommonJS module) — matches the pattern
// already used in backupService.js.
let unzipperMod;
async function getUnzipper() {
  if (!unzipperMod) unzipperMod = await import("unzipper");
  return unzipperMod;
}

export const FORMATS = {
  zip: {
    id: "zip",
    label: "ZIP",
    description: "Most compatible, moderate compression. Works everywhere.",
  },
  "tar.gz": {
    id: "tar.gz",
    label: "TAR.GZ (gzip)",
    description: "Good compression ratio, fast to create.",
  },
  "tar.zst": {
    id: "tar.zst",
    label: "TAR.ZST (zstandard)",
    description:
      "Best compression ratio, very fast decompression. Requires the zstd binary.",
  },
};

export function isFormatAvailable(format) {
  if (format === "tar.zst") return isZstdAvailable();
  return format === "zip" || format === "tar.gz";
}

export function listFormats() {
  return Object.values(FORMATS).map((f) => ({
    ...f,
    available: isFormatAvailable(f.id),
  }));
}

export async function computeChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(`sha256:${hash.digest("hex")}`));
    stream.on("error", reject);
  });
}

function compressZip({ sourceDir, destPath, entries, prefix }) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(destPath);
    const archive = archiver("zip", { zlib: { level: 6 } });
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.on("warning", (err) => {
      if (err.code !== "ENOENT") reject(err);
    });
    archive.pipe(output);

    if (entries.length === 1 && entries[0] === ".") {
      archive.directory(sourceDir, prefix);
    } else {
      for (const rel of entries) {
        archive.file(path.join(sourceDir, rel), {
          name: prefix ? path.join(prefix, rel) : rel,
        });
      }
    }
    archive.finalize();
  });
}

/**
 * Compress `sourceDir` (or a subset via `fileList`, paths relative to
 * sourceDir — used for incremental backups) into `destPath`. Returns timing
 * and size metadata only; callers already know originalSize from their own
 * directory scan and compute checksum separately (compression and hashing
 * are both full-file-size operations, no reason to make callers guess which
 * one to skip).
 */
export async function compressToFormat({
  sourceDir,
  destPath,
  format,
  fileList,
  prefix,
}) {
  if (!isFormatAvailable(format)) {
    throw new Error(`Backup format "${format}" is not available on this system.`);
  }
  const entries = fileList && fileList.length > 0 ? fileList : ["."];
  const startTime = Date.now();

  if (format === "zip") {
    await compressZip({ sourceDir, destPath, entries, prefix });
  } else if (format === "tar.gz") {
    await createTarGz({ cwd: sourceDir, entries, destPath, prefix });
  } else if (format === "tar.zst") {
    await createTarZst({ cwd: sourceDir, entries, destPath, prefix });
  } else {
    throw new Error(`Unknown backup format: ${format}`);
  }

  const compressionTime = Date.now() - startTime;
  const compressedSize = fs.statSync(destPath).size;
  return { compressionTime, compressedSize };
}

export function buildCompressionMetadata({
  format,
  originalSize,
  compressedSize,
  compressionTime,
  checksum,
}) {
  const ratio =
    originalSize > 0
      ? Math.max(Math.round((1 - compressedSize / originalSize) * 100), 0)
      : 0;
  return {
    format,
    originalSize,
    compressedSize,
    compressionRatio: `${ratio}%`,
    compressionTime,
    checksum,
  };
}

/**
 * Verify an archive is structurally readable by listing its contents.
 * Returns `{ readable, entryCount, error }` — never throws.
 */
export async function verifyArchive(format, filePath) {
  try {
    if (format === "zip") {
      const unzipper = await getUnzipper();
      const directory = await unzipper.Open.file(filePath);
      return { readable: true, entryCount: directory.files.length, error: null };
    }
    if (format === "tar.gz") {
      const names = await listTarGz(filePath);
      return { readable: true, entryCount: names.length, error: null };
    }
    if (format === "tar.zst") {
      const result = await verifyTarZst(filePath);
      return {
        readable: result.readable,
        entryCount: null,
        error: result.error || null,
      };
    }
    return { readable: false, entryCount: null, error: `Unknown format: ${format}` };
  } catch (error) {
    return { readable: false, entryCount: null, error: error.message };
  }
}

export function formatExtension(format) {
  return format; // "zip" | "tar.gz" | "tar.zst" — already valid filename suffixes
}
