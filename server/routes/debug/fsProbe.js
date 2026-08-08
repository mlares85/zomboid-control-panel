import fs from "fs";
import path from "path";
import { execFile } from "child_process";

async function pathExistsAsync(p) {
  if (!p) return false;
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

async function pathWritableAsync(p) {
  if (!p) return false;
  try {
    await fs.promises.access(p, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
// Wrap a promise with a timeout. Used to keep slow / unreachable mounts
// (broken NFS, dead SMB share, suspended VM) from hanging the entire
// diagnostics request. Returns `fallback` on timeout instead of throwing.
export function withTimeout(promise, ms, fallback) {
  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(timer);
        return v;
      },
      () => {
        clearTimeout(timer);
        return fallback;
      },
    ),
    timeoutPromise,
  ]);
}

export const FS_TIMEOUT_MS = 2000;
export const safePathExists = (p) =>
  withTimeout(pathExistsAsync(p), FS_TIMEOUT_MS, false);
export const safePathWritable = (p) =>
  withTimeout(pathWritableAsync(p), FS_TIMEOUT_MS, false);

export async function safeReaddir(p) {
  try {
    return await withTimeout(fs.promises.readdir(p), FS_TIMEOUT_MS, null);
  } catch {
    return null;
  }
}

export async function safeStat(p) {
  try {
    return await withTimeout(fs.promises.stat(p), FS_TIMEOUT_MS, null);
  } catch {
    return null;
  }
}

export async function getDiskFree(targetPath) {
  try {
    if (!targetPath) return null;
    // Preferred path: fs.promises.statfs (Node 18.15+). The pkg-bundled Node
    // is 18.5 and lacks this method, so we fall through to platform shells.
    if (typeof fs.promises.statfs === "function") {
      // statfs can hang on dead mounts on Linux — wrap with timeout.
      const stats = await withTimeout(
        fs.promises.statfs(targetPath),
        FS_TIMEOUT_MS,
        null,
      );
      if (stats) {
        return {
          free: stats.bavail * stats.bsize,
          total: stats.blocks * stats.bsize,
        };
      }
    }
    return await getDiskFreeFallback(targetPath);
  } catch {
    return null;
  }
}

function execFileP(file, args, opts = {}) {
  return new Promise((resolve) => {
    try {
      execFile(
        file,
        args,
        { timeout: FS_TIMEOUT_MS, windowsHide: true, ...opts },
        (err, stdout, stderr) => {
          if (err)
            resolve({ ok: false, stdout: stdout || "", stderr: stderr || "" });
          else
            resolve({ ok: true, stdout: stdout || "", stderr: stderr || "" });
        },
      );
    } catch {
      resolve({ ok: false, stdout: "", stderr: "" });
    }
  });
}

async function getDiskFreeFallback(targetPath) {
  try {
    const resolved = path.resolve(targetPath);
    if (process.platform === "win32") {
      // wmic is deprecated but still present on most Windows installs; fall
      // back to PowerShell Get-PSDrive when it isn't.
      const drive = resolved.slice(0, 2); // e.g. "E:"
      if (!/^[A-Za-z]:$/.test(drive)) return null;
      const letter = drive[0].toUpperCase();
      // Try PowerShell first (works on Win10/11 and Server 2016+).
      const ps = await execFileP("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$d = Get-PSDrive -Name '${letter}' -ErrorAction SilentlyContinue; if ($d) { '{0} {1}' -f $d.Free, ($d.Free + $d.Used) }`,
      ]);
      if (ps.ok) {
        const parts = ps.stdout.trim().split(/\s+/);
        if (parts.length === 2) {
          const free = Number(parts[0]);
          const total = Number(parts[1]);
          if (Number.isFinite(free) && Number.isFinite(total) && total > 0) {
            return { free, total };
          }
        }
      }
      // wmic fallback.
      const wmic = await execFileP("wmic", [
        "logicaldisk",
        "where",
        `DeviceID='${letter}:'`,
        "get",
        "FreeSpace,Size",
        "/value",
      ]);
      if (wmic.ok) {
        const freeMatch = wmic.stdout.match(/FreeSpace=(\d+)/);
        const sizeMatch = wmic.stdout.match(/Size=(\d+)/);
        if (freeMatch && sizeMatch) {
          const free = Number(freeMatch[1]);
          const total = Number(sizeMatch[1]);
          if (Number.isFinite(free) && Number.isFinite(total) && total > 0) {
            return { free, total };
          }
        }
      }
      return null;
    }
    // POSIX: df -Pk <path> → blocks (1K), used, available, capacity, mounted
    const df = await execFileP("df", ["-Pk", resolved]);
    if (!df.ok) return null;
    const lines = df.stdout.trim().split(/\r?\n/);
    if (lines.length < 2) return null;
    const cols = lines[1].trim().split(/\s+/);
    if (cols.length < 4) return null;
    const totalKb = Number(cols[1]);
    const freeKb = Number(cols[3]);
    if (!Number.isFinite(totalKb) || !Number.isFinite(freeKb)) return null;
    return { free: freeKb * 1024, total: totalKb * 1024 };
  } catch {
    return null;
  }
}
