import fs from "fs";
import path from "path";

// Tail-read `server-console.txt` and look for failed Workshop downloads.
// PZ's GameServerWorkshopItems.Install() crashes with a NullPointerException
// the moment a subscribed mod cannot be installed (delisted, private, region
// blocked, etc). We detect both the failure lines and whether the install
// step actually crashed.
//
// Returns null if no log; otherwise { ids, results, crashed, logMtime }.
export async function scanWorkshopFailures(zPath) {
  if (!zPath) return null;
  const logPath = path.join(zPath, "server-console.txt");
  let stat;
  try {
    stat = await fs.promises.stat(logPath);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size === 0) return null;

  // Only the tail matters — the relevant lines come from the most recent
  // server start. Cap at 256 KB to keep this cheap on huge log files.
  const MAX_TAIL = 256 * 1024;
  const start = Math.max(0, stat.size - MAX_TAIL);
  const length = stat.size - start;
  let text = "";
  let fd;
  try {
    fd = await fs.promises.open(logPath, "r");
    const buf = Buffer.alloc(length);
    await fd.read(buf, 0, length, start);
    text = buf.toString("utf-8");
  } catch {
    return null;
  } finally {
    if (fd) {
      try {
        await fd.close();
      } catch {
        /* ignore */
      }
    }
  }

  // Pattern: `Workshop: onItemNotDownloaded itemID=<ID> result=<N>`
  // result=9 is the common "item unavailable" / delisted case, but any
  // non-zero result lands here — we surface them all.
  const failedIds = [];
  const resultByFailedId = {};
  const re = /Workshop:\s+onItemNotDownloaded\s+itemID=(\d+)\s+result=(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!resultByFailedId[m[1]]) {
      failedIds.push(m[1]);
      resultByFailedId[m[1]] = parseInt(m[2], 10);
    }
  }

  // Crash chain: `GameServerWorkshopItems.Install` appears in the stack
  // when the install step actually aborted the server boot.
  const crashed =
    /GameServerWorkshopItems\.Install/.test(text) ||
    /Workshop:\s+item state DownloadPending\s+->\s+Fail/.test(text);

  return {
    ids: failedIds,
    results: resultByFailedId,
    crashed,
    logPath,
    logMtime: stat.mtime,
  };
}

// Generic crash scanner. Tail server-console.txt and report the most
// recent fatal symptom (OOM, main-thread exception, FATAL log line).
// Returns null when nothing notable is in the tail.
export async function scanRecentCrash(zPath) {
  if (!zPath) return null;
  const logPath = path.join(zPath, "server-console.txt");
  let stat;
  try {
    stat = await fs.promises.stat(logPath);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size === 0) return null;

  const MAX_TAIL = 256 * 1024;
  const start = Math.max(0, stat.size - MAX_TAIL);
  const length = stat.size - start;
  let text = "";
  let fd;
  try {
    fd = await fs.promises.open(logPath, "r");
    const buf = Buffer.alloc(length);
    await fd.read(buf, 0, length, start);
    text = buf.toString("utf-8");
  } catch {
    return null;
  } finally {
    if (fd) {
      try {
        await fd.close();
      } catch {
        /* ignore */
      }
    }
  }

  // Search in priority order — OOM is more actionable than a generic
  // "Exception in thread main". Each pattern keeps a short matched line
  // so the UI can show the smoking-gun text without dumping the stack.
  const patterns = [
    {
      kind: "oom",
      label: "Out of memory",
      re: /java\.lang\.OutOfMemoryError[^\n]*/,
    },
    {
      kind: "workshop",
      label: "Workshop install crash",
      re: /GameServerWorkshopItems\.Install[^\n]*/,
    },
    {
      kind: "mainException",
      label: "Uncaught main-thread exception",
      re: /Exception in thread "main"[^\n]*/,
    },
    {
      kind: "fatal",
      label: "FATAL log entry",
      re: /(?:^|\n)[^\n]*\bFATAL\b[^\n]*/,
    },
  ];
  for (const p of patterns) {
    const m = text.match(p.re);
    if (m)
      return {
        kind: p.kind,
        label: p.label,
        line: m[0].trim().slice(0, 240),
        logMtime: stat.mtime,
      };
  }
  return null;
}
