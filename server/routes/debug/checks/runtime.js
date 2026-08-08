import os from "os";
import v8 from "v8";
import { diagFail, diagInfo, diagOk, diagWarn, fmtAge, fmtGB, fmtMB } from "../diagHelpers.js";

// Runtime health: V8 heap pressure vs the real ceiling, host RAM, uptime.
export function buildRuntimeChecks(checks) {

  // ─── Runtime ───────────────────────────────────────────────────────
  try {
    {
      const mem = process.memoryUsage();
      // heapTotal is just the size of the V8 segment currently allocated —
      // it grows on demand (in chunks) as heapUsed approaches it, so
      // heapUsed/heapTotal routinely sits at 80-95% under completely
      // normal, healthy operation (most visible right after startup or
      // under light load, before V8 has needed to grow the segment much).
      // That ratio was previously used directly as the health-check
      // percentage, which fired constant false "heap usage high/critical"
      // warnings unrelated to actual memory pressure. The only ratio that
      // means anything is heapUsed against the real ceiling — V8's actual
      // configured heap_size_limit (what --max-old-space-size controls,
      // several GB by default) — since that's the number that matters for
      // "is this process actually at risk of an out-of-memory crash".
      const heapLimit = v8.getHeapStatistics().heap_size_limit;
      const heapPct = heapLimit > 0 ? (mem.heapUsed / heapLimit) * 100 : 0;
      const detail = `${fmtMB(mem.heapUsed)} used of ${fmtMB(heapLimit)} limit (${fmtMB(mem.heapTotal)} currently allocated).`;
      if (heapPct >= 90) {
        checks.push(
          diagFail(
            "runtime.heap",
            "Heap usage critical",
            `Heap at ${heapPct.toFixed(0)}% of its limit. ${detail} Restart recommended.`,
            { category: "runtime" },
          ),
        );
      } else if (heapPct >= 75) {
        checks.push(
          diagWarn(
            "runtime.heap",
            "Heap usage high",
            `Heap at ${heapPct.toFixed(0)}% of its limit. ${detail}`,
            { category: "runtime" },
          ),
        );
      } else {
        checks.push(
          diagOk(
            "runtime.heap",
            "Heap usage healthy",
            `${heapPct.toFixed(0)}% of limit. ${detail}`,
            { category: "runtime" },
          ),
        );
      }

      const totalHostMem = os.totalmem();
      const freeHostMem = os.freemem();
      const usedPct = ((totalHostMem - freeHostMem) / totalHostMem) * 100;
      if (freeHostMem < 256 * 1024 * 1024) {
        checks.push(
          diagFail(
            "runtime.hostMem",
            "Host RAM exhausted",
            `Only ${fmtMB(freeHostMem)} free of ${fmtGB(totalHostMem)}. Server may crash.`,
            { category: "runtime" },
          ),
        );
      } else if (usedPct > 90) {
        checks.push(
          diagWarn(
            "runtime.hostMem",
            "Host RAM pressure",
            `${usedPct.toFixed(0)}% used (${fmtGB(totalHostMem - freeHostMem)} / ${fmtGB(totalHostMem)}).`,
            { category: "runtime" },
          ),
        );
      } else {
        checks.push(
          diagOk(
            "runtime.hostMem",
            "Host RAM healthy",
            `${usedPct.toFixed(0)}% used of ${fmtGB(totalHostMem)}.`,
            { category: "runtime" },
          ),
        );
      }

      checks.push(
        diagInfo(
          "runtime.uptime",
          "Panel uptime",
          `${fmtAge(process.uptime() * 1000).replace(" ago", "")}.`,
          { category: "runtime" },
        ),
      );
    }
  } catch (e) {
    checks.push(
      diagWarn(
        "runtime.error",
        "Runtime checks errored",
        `Memory/uptime checks could not run: ${e?.message || "unknown"}`,
        { category: "runtime" },
      ),
    );
  }
}
