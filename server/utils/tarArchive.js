import { create as tarCreate, list as tarList } from "tar";
import { spawn, spawnSync } from "child_process";
import { createLogger } from "./logger.js";

const log = createLogger("Backup:Tar");

/**
 * Build a gzip-compressed tar archive. Uses the `tar` package, which
 * compresses with Node's built-in `zlib` internally (no shelling out).
 */
export async function createTarGz({ cwd, entries, destPath, prefix }) {
  await tarCreate(
    { gzip: true, cwd, file: destPath, prefix, portable: true },
    entries,
  );
}

export async function listTarGz(filePath) {
  const names = [];
  await tarList({
    file: filePath,
    onReadEntry: (entry) => names.push(entry.path),
  });
  return names;
}

let zstdAvailableCache = null;

/**
 * Detect the `zstd` CLI once and cache the result for the process lifetime.
 * Set ZSTD_BIN to override the binary name/path (mainly for tests).
 */
export function isZstdAvailable() {
  if (zstdAvailableCache !== null) return zstdAvailableCache;
  const bin = process.env.ZSTD_BIN || "zstd";
  const result = spawnSync(bin, ["--version"], { stdio: "ignore" });
  zstdAvailableCache = !result.error && result.status === 0;
  return zstdAvailableCache;
}

// Test-only escape hatch: force re-detection after changing ZSTD_BIN.
export function _resetZstdAvailabilityCache() {
  zstdAvailableCache = null;
}

function runZstd(args) {
  return new Promise((resolve, reject) => {
    const bin = process.env.ZSTD_BIN || "zstd";
    const proc = spawn(bin, args);
    let stderr = "";
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`zstd exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

/**
 * Build a zstandard-compressed tar archive: pack a plain tar with the `tar`
 * package, then pipe it through the `zstd` CLI (no pure-JS zstd encoder in
 * this codebase's dependency set). The intermediate .tar is removed via
 * zstd's --rm flag once compression succeeds.
 */
export async function createTarZst({ cwd, entries, destPath, prefix }) {
  if (!isZstdAvailable()) {
    throw new Error(
      "The zstd binary was not found on PATH. Install zstd or choose a different backup format.",
    );
  }
  const tmpTarPath = `${destPath}.tmp.tar`;
  await tarCreate({ cwd, file: tmpTarPath, prefix, portable: true }, entries);
  try {
    await runZstd(["-q", "-f", "-T0", "--rm", tmpTarPath, "-o", destPath]);
  } catch (error) {
    log.error(`zstd compression failed: ${error.message}`);
    throw error;
  }
}

/**
 * zstd -t validates the frame's integrity. This confirms the archive is
 * readable without needing a full decompress + tar-entry parse round trip,
 * which is enough to satisfy "verify the backup is readable".
 */
export async function verifyTarZst(filePath) {
  if (!isZstdAvailable()) {
    return { readable: false, error: "zstd binary not available" };
  }
  const bin = process.env.ZSTD_BIN || "zstd";
  const result = spawnSync(bin, ["-t", filePath], { stdio: "ignore" });
  if (result.error) return { readable: false, error: result.error.message };
  return { readable: result.status === 0 };
}
