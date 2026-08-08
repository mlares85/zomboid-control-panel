import { diagFail, diagInfo, diagOk, diagWarn } from "../diagHelpers.js";
import { withTimeout } from "../fsProbe.js";
import { probeSteamWorkshopApi } from "../probes.js";

// Update health: Steam Workshop API reachability + host-clock skew (derived
// from the same probe), panel update availability, and mod update count.
export async function buildUpdateChecks(checks, ctx) {
  const { panelUpdateChecker, trackedMods } = ctx;

  // ─── Updates ───────────────────────────────────────────────────────
  // Steam Workshop API probe is needed by both update.steamApi and the
  // host-clock check (we read its Date response header). Compute once.
  const steamProbe = await withTimeout(probeSteamWorkshopApi(), 6000, {
    reachable: false,
    error: "timeout",
  });
  try {
    if (steamProbe.reachable) {
      checks.push(
        diagOk(
          "update.steamApi",
          "Steam Workshop API reachable",
          `api.steampowered.com responded in ${steamProbe.latencyMs} ms (HTTP ${steamProbe.statusCode}).`,
          { category: "updates" },
        ),
      );
    } else {
      checks.push(
        diagWarn(
          "update.steamApi",
          "Steam Workshop API unreachable",
          `Could not reach api.steampowered.com (${steamProbe.error || `HTTP ${steamProbe.statusCode}`}). Mod-update polling and the Workshop crash detector will both go blind.`,
          {
            category: "updates",
            hint: "Check the panel host's outbound HTTPS access.",
          },
        ),
      );
    }

    // Host-clock skew vs Steam's server-side time. Cron-scheduled tasks
    // depend on the local clock being correct; mod publish timestamps too.
    if (steamProbe.serverTime) {
      const skewMs = steamProbe.localTime - steamProbe.serverTime;
      const absSkew = Math.abs(skewMs);
      const direction = skewMs > 0 ? "ahead" : "behind";
      const fmt =
        absSkew < 60000
          ? `${Math.round(absSkew / 1000)}s`
          : `${Math.round(absSkew / 60000)}m`;
      if (absSkew >= 5 * 60 * 1000) {
        checks.push(
          diagFail(
            "runtime.timeSkew",
            "Host clock is wrong",
            `Panel host clock is ${fmt} ${direction} of Steam time. Scheduled tasks will fire at the wrong wall-clock time and HTTPS handshakes may fail.`,
            {
              category: "runtime",
              hint:
                process.platform === "linux"
                  ? "Run: sudo timedatectl set-ntp true"
                  : "Settings → Date & Time → Set time automatically",
              meta: { skewMs },
            },
          ),
        );
      } else if (absSkew >= 30 * 1000) {
        checks.push(
          diagWarn(
            "runtime.timeSkew",
            "Host clock slightly off",
            `Panel host clock is ${fmt} ${direction} of Steam time.`,
            { category: "runtime", meta: { skewMs } },
          ),
        );
      } else {
        checks.push(
          diagOk(
            "runtime.timeSkew",
            "Host clock in sync",
            `Within ${fmt} of Steam time.`,
            { category: "runtime", meta: { skewMs } },
          ),
        );
      }
    }

    if (panelUpdateChecker?.updateAvailable) {
      const latest =
        panelUpdateChecker.latestRelease?.tag_name ||
        panelUpdateChecker.latestRelease?.name ||
        "newer version";
      checks.push(
        diagInfo(
          "update.panel",
          "Panel update available",
          `${latest} is newer than your installed v${panelUpdateChecker.currentVersion || "?"}.`,
          { category: "updates", hint: "Settings → Updates" },
        ),
      );
    } else if (panelUpdateChecker) {
      checks.push(
        diagOk(
          "update.panel",
          "Panel up to date",
          `Running v${panelUpdateChecker.currentVersion || "?"}.`,
          { category: "updates" },
        ),
      );
    }

    {
      const outdated = (trackedMods || []).filter(
        (m) => m.updateAvailable,
      ).length;
      if (outdated > 0) {
        checks.push(
          diagInfo(
            "update.mods",
            "Mod updates available",
            `${outdated} mod${outdated === 1 ? "" : "s"} have updates on Steam Workshop.`,
            { category: "updates", hint: "Mods → Update Subscriptions" },
          ),
        );
      } else if ((trackedMods || []).length > 0) {
        checks.push(
          diagOk(
            "update.mods",
            "All mods current",
            `${trackedMods.length} tracked, none flagged for update.`,
            { category: "updates" },
          ),
        );
      }
    }
  } catch (e) {
    checks.push(
      diagWarn(
        "updates.error",
        "Update checks errored",
        `Update checks could not run: ${e?.message || "unknown"}`,
        { category: "updates" },
      ),
    );
  }
}
