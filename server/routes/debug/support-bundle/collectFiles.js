import fs from "fs";
import path from "path";
import { createLogger } from "../../../utils/logger.js";
import { getDataPaths } from "../../../utils/paths.js";
import { getActiveServer } from "../../../database/init.js";

const log = createLogger("API:Debug");

export async function getAvailableLogFiles(logsDir) {
  const entries = await fs.promises.readdir(logsDir, { withFileTypes: true });

  const files = (
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
        .map(async (entry) => {
          try {
            const filePath = path.join(logsDir, entry.name);
            const stats = await fs.promises.stat(filePath);
            return {
              name: entry.name,
              size: stats.size,
              modified: stats.mtime.toISOString(),
            };
          } catch (error) {
            log.debug(
              `Stat failed for log file ${entry.name}: ${error.message}`,
            );
            return null;
          }
        }),
    )
  )
    .filter((file) => file !== null)
    .sort(
      (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime(),
    );

  return files;
}

const SUPPORT_LOG_FILE_RE = /\.(log|txt)$/i;
const CRASH_FILE_RE =
  /^(hs_err_pid.*|.*(?:crash|error|exception).*)\.(log|txt)$/i;

async function resolveSearchRoot(candidate) {
  if (!candidate) return null;

  const resolved = path.resolve(candidate);

  try {
    const stats = await fs.promises.stat(resolved);
    return stats.isDirectory() ? resolved : path.dirname(resolved);
  } catch {
    return path.extname(resolved) ? path.dirname(resolved) : resolved;
  }
}

async function collectBundleFilesFromDir(
  dir,
  matcher,
  archivePrefix,
  entries,
  seenFiles,
) {
  if (!dir) return;

  try {
    await fs.promises.access(dir);
  } catch {
    return;
  }

  const dirEntries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of dirEntries) {
    if (!entry.isFile()) continue;
    if (!matcher(entry.name)) continue;

    const filePath = path.join(dir, entry.name);
    const dedupeKey = path.resolve(filePath).toLowerCase();
    if (seenFiles.has(dedupeKey)) continue;

    seenFiles.add(dedupeKey);
    entries.push({
      filePath,
      archivePath: `${archivePrefix}/${entry.name}`,
    });
  }
}

export async function getSupportBundleEntries() {
  const paths = getDataPaths();
  const activeServer = await getActiveServer().catch(() => null);

  const installRoot = await resolveSearchRoot(activeServer?.installPath || "");
  const zomboidDataRoot = await resolveSearchRoot(
    activeServer?.zomboidDataPath || "",
  );

  const entries = [];
  const seenFiles = new Set();

  await collectBundleFilesFromDir(
    paths.logsDir,
    (name) => SUPPORT_LOG_FILE_RE.test(name) && !name.startsWith("."),
    "admin-panel",
    entries,
    seenFiles,
  );

  await collectBundleFilesFromDir(
    zomboidDataRoot,
    (name) => SUPPORT_LOG_FILE_RE.test(name),
    "zomboid-server/root",
    entries,
    seenFiles,
  );

  await collectBundleFilesFromDir(
    zomboidDataRoot ? path.join(zomboidDataRoot, "Logs") : null,
    (name) => SUPPORT_LOG_FILE_RE.test(name),
    "zomboid-server/Logs",
    entries,
    seenFiles,
  );

  await collectBundleFilesFromDir(
    installRoot ? path.join(installRoot, "logs") : null,
    (name) => SUPPORT_LOG_FILE_RE.test(name),
    "zomboid-install/logs",
    entries,
    seenFiles,
  );

  await collectBundleFilesFromDir(
    installRoot,
    (name) => CRASH_FILE_RE.test(name),
    "crash-logs/install-root",
    entries,
    seenFiles,
  );

  await collectBundleFilesFromDir(
    installRoot ? path.join(installRoot, "logs") : null,
    (name) => CRASH_FILE_RE.test(name),
    "crash-logs/install-logs",
    entries,
    seenFiles,
  );

  await collectBundleFilesFromDir(
    zomboidDataRoot,
    (name) => CRASH_FILE_RE.test(name),
    "crash-logs/server-root",
    entries,
    seenFiles,
  );

  await collectBundleFilesFromDir(
    zomboidDataRoot ? path.join(zomboidDataRoot, "Logs") : null,
    (name) => CRASH_FILE_RE.test(name),
    "crash-logs/server-logs",
    entries,
    seenFiles,
  );

  return {
    entries,
    activeServer,
    sources: {
      panelLogsDir: paths.logsDir,
      installRoot,
      zomboidDataRoot,
    },
  };
}
