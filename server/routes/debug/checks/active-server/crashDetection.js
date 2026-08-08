import { diagFail, diagWarn } from "../../diagHelpers.js";
import { FS_TIMEOUT_MS, withTimeout } from "../../fsProbe.js";
import { scanRecentCrash, scanWorkshopFailures } from "../../crashScan.js";

// Detects a failed Workshop-mod install crash and any other recent crash
// symptom (OOM, main-thread exception, FATAL) from server-console.txt.
export async function checkCrashDetection(checks, zPath) {
  // Workshop install crash / failed-mod detector.
  // PZ aborts on boot with a NullPointerException if any subscribed
  // Workshop mod fails to download (delisted, private, region locked).
  // We tail server-console.txt for the smoking-gun lines and flag the
  // offending IDs so the user can remove them from the .ini.
  let workshopCrashed = false;
  if (zPath) {
    const wf = await withTimeout(
      scanWorkshopFailures(zPath),
      FS_TIMEOUT_MS,
      null,
    );
    if (wf && wf.ids.length > 0) {
      const shown = wf.ids.slice(0, 5).join(", ");
      const idList =
        wf.ids.length > 5
          ? `${shown}, +${wf.ids.length - 5} more`
          : shown;
      const ageMin = Math.max(
        0,
        Math.round((Date.now() - wf.logMtime.getTime()) / 60000),
      );
      const ageLabel =
        ageMin < 60
          ? `${ageMin}m ago`
          : ageMin < 1440
            ? `${Math.round(ageMin / 60)}h ago`
            : `${Math.round(ageMin / 1440)}d ago`;
      const plural = wf.ids.length > 1 ? "s" : "";
      const meta = {
        failedIds: wf.ids,
        results: wf.results,
        crashed: wf.crashed,
        logMtime: wf.logMtime,
      };
      if (wf.crashed) {
        workshopCrashed = true;
        checks.push(
          diagFail(
            "mods.workshopCrash",
            "Workshop mod download failed — server boot aborted",
            `${wf.ids.length} Workshop item${plural} could not be downloaded and the server crashed during install (last log update ${ageLabel}). Failing ID${plural}: ${idList}. The mod${plural} ${plural ? "are" : "is"} most likely delisted, made private, or region-restricted.`,
            {
              category: "server",
              hint: `Open Server Config and remove ${wf.ids.length > 1 ? "these IDs" : "this ID"} from both WorkshopItems= and Mods=, then restart.`,
              meta,
            },
          ),
        );
      } else {
        checks.push(
          diagWarn(
            "mods.workshopCrash",
            "Workshop download warnings",
            `${wf.ids.length} Workshop item${plural} recently failed to download but the server did not crash (last log update ${ageLabel}). ID${plural}: ${idList}.`,
            {
              category: "server",
              hint: "Verify each ID is still public on the Steam Workshop, or remove it from the server config.",
              meta,
            },
          ),
        );
      }
    }
  }

  // Generic recent-crash detector. Catches OOMs, main-thread exceptions,
  // and FATAL log entries that aren't the Workshop install crash (which
  // we already flagged above with richer detail).
  if (zPath) {
    const rc = await withTimeout(
      scanRecentCrash(zPath),
      FS_TIMEOUT_MS,
      null,
    );
    if (rc && !(workshopCrashed && rc.kind === "workshop")) {
      const ageMin = Math.max(
        0,
        Math.round((Date.now() - rc.logMtime.getTime()) / 60000),
      );
      const ageLabel =
        ageMin < 60
          ? `${ageMin}m ago`
          : ageMin < 1440
            ? `${Math.round(ageMin / 60)}h ago`
            : `${Math.round(ageMin / 1440)}d ago`;
      const hint =
        rc.kind === "oom"
          ? "Raise the server's Java heap (-Xmx in the start script) or reduce mod count."
          : "Open the Logs page and read the stack trace around the timestamp.";
      checks.push(
        diagFail(
          "server.recentCrash",
          `Recent crash: ${rc.label}`,
          `Found in server-console.txt (last update ${ageLabel}): ${rc.line}`,
          {
            category: "server",
            hint,
            meta: { kind: rc.kind, logMtime: rc.logMtime },
          },
        ),
      );
    }
  }

  return workshopCrashed;
}
