import path from "path";
import { safePathExists, safeReaddir, safeStat } from "./fsProbe.js";

// Recursively scan a save folder. Returns total bytes, .bin chunk count,
// and any stale lock files (>1h old, which prevent boot). Bounded by
// MAX_FILES to keep huge saves from making diagnostics hang.
export async function scanSaveStats(saveDir) {
  if (!saveDir) return null;
  const exists = await safePathExists(saveDir);
  if (!exists) return null;
  const MAX_FILES = 50000;
  const staleAfterMs = 60 * 60 * 1000;
  const now = Date.now();
  let totalBytes = 0;
  let chunks = 0;
  let staleLocks = [];
  let visited = 0;
  let truncated = false;

  const walk = async (dir) => {
    if (visited >= MAX_FILES) {
      truncated = true;
      return;
    }
    const names = await safeReaddir(dir);
    if (!names) return;
    for (const name of names) {
      if (++visited > MAX_FILES) {
        truncated = true;
        return;
      }
      const full = path.join(dir, name);
      const st = await safeStat(full);
      if (!st) continue;
      if (st.isDirectory()) {
        await walk(full);
      } else if (st.isFile()) {
        totalBytes += st.size;
        if (name.endsWith(".bin")) chunks++;
        if (
          (name.endsWith(".lock") || name === ".lock") &&
          now - st.mtimeMs > staleAfterMs
        ) {
          staleLocks.push({ path: full, ageMs: now - st.mtimeMs });
        }
      }
    }
  };
  await walk(saveDir);
  return { totalBytes, chunks, staleLocks, truncated };
}
