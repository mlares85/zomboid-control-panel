import express from "express";
import { createLogger } from "../../../utils/logger.js";
import { getDataPaths } from "../../../utils/paths.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import {
  getActiveServer,
  getAllSettings,
  getDatabaseStats,
  getScheduledTasks,
  getTrackedMods,
} from "../../../database/init.js";
import { DIAG_CATEGORIES } from "../diagHelpers.js";
import { FS_TIMEOUT_MS, withTimeout } from "../fsProbe.js";
import { buildActiveServerChecks } from "../checks/active-server/index.js";
import { buildBridgeIpcChecks } from "../checks/bridgeIpc.js";
import { buildCoreServiceChecks } from "../checks/coreServices.js";
import { buildRuntimeChecks } from "../checks/runtime.js";
import { buildStorageChecks } from "../checks/storage.js";
import { buildUpdateChecks } from "../checks/updates.js";

const log = createLogger("API:Debug");
const router = express.Router();

// ============================================
// Smart Diagnostics
// ============================================
//
// Runs ~25 health checks across services, paths, storage, and updates.
// Each check returns:
//   { id, label, status, message, hint?, category, severity }
// status: 'ok' | 'warn' | 'fail' | 'info' | 'skip'
// severity: 'critical' | 'warning' | 'info'
//
// The frontend renders this as a checklist with green/amber/red icons and
// per-check fix hints.

router.get("/diagnostics", async (req, res) => {
  const t0 = Date.now();
  try {
    const rconService = req.app.get("rconService");
    const serverManager = req.app.get("serverManager");
    const modChecker = req.app.get("modChecker");
    const scheduler = req.app.get("scheduler");
    const discordBot = req.app.get("discordBot");
    const panelUpdateChecker = req.app.get("panelUpdateChecker");

    const checks = [];
    const paths = getDataPaths();

    // checkServerRunning may probe the OS process list and can hang on a
    // misbehaving system — keep it bounded.
    const checkRunningPromise = serverManager?.checkServerRunning?.()
      ? withTimeout(serverManager.checkServerRunning(), FS_TIMEOUT_MS, false)
      : Promise.resolve(false);

    const [
      activeServer,
      settings,
      trackedMods,
      scheduledTasks,
      serverRunning,
      dbStats,
    ] = await Promise.all([
      withTimeout(
        getActiveServer().catch(() => null),
        FS_TIMEOUT_MS,
        null,
      ),
      withTimeout(
        getAllSettings().catch(() => ({})),
        FS_TIMEOUT_MS,
        {},
      ),
      withTimeout(
        getTrackedMods().catch(() => []),
        FS_TIMEOUT_MS,
        [],
      ),
      withTimeout(
        getScheduledTasks().catch(() => []),
        FS_TIMEOUT_MS,
        [],
      ),
      Promise.resolve(checkRunningPromise)
        .then((v) => v || false)
        .catch(() => false),
      withTimeout(
        getDatabaseStats().catch(() => null),
        FS_TIMEOUT_MS,
        null,
      ),
    ]);

    buildCoreServiceChecks(checks, {
      activeServer,
      rconService,
      serverRunning,
      modChecker,
      scheduledTasks,
      scheduler,
      discordBot,
      settings,
    });

    await buildActiveServerChecks(checks, req, activeServer);

    await buildBridgeIpcChecks(checks, { serverRunning });

    await buildStorageChecks(checks, { paths, dbStats }, req);

    buildRuntimeChecks(checks);

    await buildUpdateChecks(checks, { panelUpdateChecker, trackedMods });

    // ─── Aggregate ─────────────────────────────────────────────────────
    const summary = { ok: 0, warn: 0, fail: 0, info: 0, skip: 0 };
    for (const c of checks) summary[c.status] = (summary[c.status] || 0) + 1;
    const overall =
      summary.fail > 0 ? "fail" : summary.warn > 0 ? "warn" : "ok";

    res.json({
      timestamp: new Date().toISOString(),
      overall,
      summary,
      categories: DIAG_CATEGORIES,
      checks,
      durationMs: Date.now() - t0,
    });
  } catch (error) {
    log.error(`Diagnostics failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
