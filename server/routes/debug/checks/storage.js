import path from "path";
import {
  diagFail,
  diagInfo,
  diagOk,
  diagSkip,
  diagWarn,
  fmtAge,
  fmtGB,
  fmtMB,
} from "../diagHelpers.js";
import {
  getDiskFree,
  safePathExists,
  safePathWritable,
  safeReaddir,
  safeStat,
} from "../fsProbe.js";

// Storage & database health: db.json presence/writability, backups, disk
// free space, and save-folder size (read from req._diagSaveStats, set by
// the active-server checks earlier in the same /diagnostics request).
export async function buildStorageChecks(checks, ctx, req) {
  const { paths, dbStats } = ctx;

  // ─── Storage & Database ────────────────────────────────────────────
  try {
    const exists = await safePathExists(paths.dbPath);
    if (!exists) {
      checks.push(
        diagFail(
          "db.exists",
          "Database file missing",
          "data/db.json does not exist. Panel cannot persist any settings.",
          { category: "storage" },
        ),
      );
    } else if (!(await safePathWritable(paths.dbPath))) {
      checks.push(
        diagFail(
          "db.writable",
          "Database not writable",
          "db.json exists but is read-only. Settings changes will fail.",
          {
            category: "storage",
            hint:
              process.platform === "linux"
                ? "Run: chmod u+w data/db.json (and check the data/ directory is owned by the panel user)"
                : "Check file permissions on data/db.json",
          },
        ),
      );
    } else {
      checks.push(
        diagOk(
          "db.writable",
          "Database accessible",
          `${dbStats?.collections?.length || "?"} collections, ${fmtMB(dbStats?.size || 0)}.`,
          { category: "storage" },
        ),
      );
    }
  } catch (e) {
    checks.push(
      diagWarn(
        "db.exists",
        "Database check failed",
        `Could not inspect db.json: ${e?.message || "unknown error"}`,
        { category: "storage" },
      ),
    );
  }

  try {
    const backupsDir = path.join(paths.dataDir, "backups");
    if (await safePathExists(backupsDir)) {
      const files = await safeReaddir(backupsDir);
      if (!files) {
        checks.push(
          diagWarn(
            "db.backup",
            "Backup status unknown",
            "Could not read the backup directory (timeout or permission denied).",
            { category: "storage" },
          ),
        );
      } else {
        const stats = await Promise.all(
          files
            .filter((f) => f.endsWith(".json"))
            .map(async (f) => {
              const st = await safeStat(path.join(backupsDir, f));
              return st ? st.mtimeMs : 0;
            }),
        );
        const newest = stats.length > 0 ? Math.max(...stats) : 0;
        const age = newest ? Date.now() - newest : Infinity;
        if (!newest) {
          checks.push(
            diagWarn(
              "db.backup",
              "No database backups",
              "No db.json backups found. Manual backup recommended before risky changes.",
              {
                category: "storage",
                hint: "Debug → Database → Create Backup",
              },
            ),
          );
        } else if (age < 24 * 3600_000) {
          checks.push(
            diagOk(
              "db.backup",
              "Database backup recent",
              `Newest backup ${fmtAge(age)}.`,
              { category: "storage" },
            ),
          );
        } else {
          checks.push(
            diagWarn(
              "db.backup",
              "Database backup old",
              `Newest backup ${fmtAge(age)}. Consider creating a fresh one.`,
              {
                category: "storage",
                hint: "Debug → Database → Create Backup",
              },
            ),
          );
        }
      }
    } else {
      checks.push(
        diagInfo(
          "db.backup",
          "Backup directory not yet created",
          "Will be created on first backup.",
          { category: "storage" },
        ),
      );
    }
  } catch (e) {
    checks.push(
      diagWarn(
        "db.backup",
        "Backup status unknown",
        `Could not inspect backups: ${e?.message || "unknown error"}`,
        { category: "storage" },
      ),
    );
  }

  try {
    if (await safePathWritable(paths.logsDir)) {
      checks.push(
        diagOk(
          "logs.writable",
          "Logs directory writable",
          "Panel can write logs.",
          { category: "storage" },
        ),
      );
    } else {
      checks.push(
        diagFail(
          "logs.writable",
          "Logs directory not writable",
          "Cannot write to logs folder — log capture and downloads will fail.",
          { category: "storage" },
        ),
      );
    }

    {
      const disk = await getDiskFree(paths.dataDir);
      if (!disk) {
        checks.push(
          diagSkip(
            "disk.free",
            "Disk space",
            "Free space check not supported on this platform.",
            { category: "storage" },
          ),
        );
      } else if (disk.free < 500 * 1024 * 1024) {
        checks.push(
          diagFail(
            "disk.free",
            "Disk almost full",
            `Only ${fmtGB(disk.free)} free of ${fmtGB(disk.total)} on data drive.`,
            {
              category: "storage",
              hint: "Free up disk space — saves and backups will fail",
            },
          ),
        );
      } else if (disk.free < 5 * 1024 * 1024 * 1024) {
        checks.push(
          diagWarn(
            "disk.free",
            "Low disk space",
            `${fmtGB(disk.free)} free of ${fmtGB(disk.total)} on data drive.`,
            { category: "storage" },
          ),
        );
      } else {
        checks.push(
          diagOk(
            "disk.free",
            "Disk space healthy",
            `${fmtGB(disk.free)} free of ${fmtGB(disk.total)}.`,
            { category: "storage" },
          ),
        );
      }
    }

    // Save folder size + chunk count. Computed in the active-server block
    // and stashed on req for us so we don't walk the tree twice.
    {
      const ss = req._diagSaveStats;
      if (ss) {
        const sizeGb = ss.totalBytes / 1024 / 1024 / 1024;
        const summary =
          `${fmtGB(ss.totalBytes)} across ${ss.chunks.toLocaleString()} chunk${ss.chunks === 1 ? "" : "s"}` +
          (ss.truncated ? " (scan truncated)" : "");
        const meta = {
          totalBytes: ss.totalBytes,
          chunks: ss.chunks,
          truncated: ss.truncated,
          saveDir: ss.saveDirUsed,
        };
        if (sizeGb > 30) {
          checks.push(
            diagWarn(
              "storage.saveSize",
              "Save folder very large",
              `${summary}. Backups, restores, and chunk cleanups will be slow.`,
              {
                category: "storage",
                hint: "Run the Chunk Cleaner to trim unloaded cells, or archive old saves.",
                meta,
              },
            ),
          );
        } else if (sizeGb > 10) {
          checks.push(
            diagInfo("storage.saveSize", "Save folder large", `${summary}.`, {
              category: "storage",
              meta,
            }),
          );
        } else {
          checks.push(
            diagOk("storage.saveSize", "Save folder healthy", `${summary}.`, {
              category: "storage",
              meta,
            }),
          );
        }
      }
    }
  } catch (e) {
    checks.push(
      diagWarn(
        "storage.error",
        "Storage checks errored",
        `Logs/disk checks could not run: ${e?.message || "unknown"}`,
        { category: "storage" },
      ),
    );
  }
}
