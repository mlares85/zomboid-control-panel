import fs from "fs";
import os from "os";
import path from "path";
import { compressToFormat, listFormats } from "./backupCompression.js";
import { scanDirectory } from "./backupIncremental.js";

const DEFAULT_MAX_SAMPLE_BYTES = 5 * 1024 * 1024; // 5 MB — enough to see real ratios, small enough to be fast

async function buildSample(sourceDir, maxSampleBytes) {
  const files = await scanDirectory(sourceDir);
  const sampleDir = fs.mkdtempSync(path.join(os.tmpdir(), "pz-format-sample-"));
  let sampleSize = 0;

  for (const [rel, info] of Object.entries(files)) {
    if (sampleSize >= maxSampleBytes) break;
    const src = path.join(sourceDir, rel);
    const dest = path.join(sampleDir, rel);
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      sampleSize += info.size;
    } catch {
      /* file vanished between scan and copy — skip it */
    }
  }

  return { sampleDir, sampleSize };
}

/**
 * Compress a small sample of `sourceDir` with every known format and report
 * size/time for each, so the UI can show a real (if approximate) comparison
 * without compressing the entire — possibly multi-GB — save just to compare.
 */
export async function compareFormatsOnSample(sourceDir, { maxSampleBytes = DEFAULT_MAX_SAMPLE_BYTES } = {}) {
  if (!sourceDir || !fs.existsSync(sourceDir)) {
    return { success: false, message: "No save configured to sample.", results: [] };
  }

  const { sampleDir, sampleSize } = await buildSample(sourceDir, maxSampleBytes);
  try {
    if (sampleSize === 0) {
      return { success: false, message: "No save files found to sample.", results: [] };
    }

    const results = [];
    for (const format of listFormats()) {
      if (!format.available) {
        results.push({ format: format.id, available: false, error: `${format.label} is not available on this system.` });
        continue;
      }
      const destPath = path.join(sampleDir, `..`, `sample.${format.id}`);
      try {
        const { compressedSize, compressionTime } = await compressToFormat({
          sourceDir: sampleDir,
          destPath,
          format: format.id,
        });
        const ratio = sampleSize > 0 ? Math.max(Math.round((1 - compressedSize / sampleSize) * 100), 0) : 0;
        results.push({ format: format.id, available: true, compressedSize, ratio: `${ratio}%`, timeMs: compressionTime });
      } catch (error) {
        results.push({ format: format.id, available: true, error: error.message });
      } finally {
        fs.rmSync(destPath, { force: true });
      }
    }

    return { success: true, sampleSizeBytes: sampleSize, results };
  } finally {
    fs.rmSync(sampleDir, { recursive: true, force: true });
  }
}
