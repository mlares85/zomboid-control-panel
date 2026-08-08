import { execFile } from "child_process";

// Execute the bundled JRE with `-version`. PZ prints to stderr. Returns
// { ok, version, error } with a hard timeout so we never block the
// diagnostics request on a wedged Java.
export function probeJre(javaPath) {
  return new Promise((resolve) => {
    if (!javaPath) return resolve({ ok: false, error: "no path" });
    let done = false;
    let child;
    const finish = (result) => {
      if (done) return;
      done = true;
      try {
        child?.kill?.("SIGKILL");
      } catch {
        /* ignore */
      }
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ ok: false, error: "timeout" }),
      4000,
    );
    try {
      child = execFile(
        javaPath,
        ["-version"],
        { timeout: 4000, windowsHide: true },
        (err, stdout, stderr) => {
          clearTimeout(timer);
          const text = (stderr || stdout || "").toString();
          const first = text.split(/\r?\n/).find(Boolean) || "";
          if (err) {
            return finish({
              ok: false,
              error:
                err.code === "ENOENT"
                  ? "binary missing"
                  : err.message || "exec failed",
              output: first || null,
            });
          }
          finish({ ok: true, version: first });
        },
      );
    } catch (e) {
      clearTimeout(timer);
      finish({ ok: false, error: e?.message || "exec failed" });
    }
  });
}

// Single HTTP probe to Steam Web API. Used for both reachability and
// host-clock skew (we read the Date response header).
export async function probeSteamWorkshopApi() {
  const t0 = Date.now();
  try {
    if (
      typeof fetch !== "function" ||
      typeof AbortSignal === "undefined" ||
      typeof AbortSignal.timeout !== "function"
    ) {
      return { reachable: false, error: "fetch unavailable", latencyMs: 0 };
    }
    const ctrl = AbortSignal.timeout(5000);
    const resp = await fetch(
      "https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v0001/",
      {
        method: "GET",
        signal: ctrl,
      },
    );
    const dateHeader = resp.headers.get("date");
    let serverTime = null;
    if (dateHeader) {
      const parsed = Date.parse(dateHeader);
      if (Number.isFinite(parsed)) serverTime = parsed;
    }
    return {
      reachable: resp.ok,
      statusCode: resp.status,
      latencyMs: Date.now() - t0,
      serverTime,
      localTime: Date.now(),
    };
  } catch (e) {
    return {
      reachable: false,
      statusCode: null,
      latencyMs: Date.now() - t0,
      error: e?.name === "TimeoutError" ? "timeout" : e?.message || "unknown",
    };
  }
}
