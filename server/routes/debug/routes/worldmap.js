import express from "express";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import { getActiveServer } from "../../../database/init.js";
import { FS_TIMEOUT_MS, withTimeout } from "../fsProbe.js";
import { diagWarn } from "../diagHelpers.js";
import { WORLDMAP_HANDLERS } from "../checks/worldmap/probes.js";
import { checkTileSources } from "../checks/worldmap/tileChecks.js";
import { checkBridgeLiveData } from "../checks/worldmap/bridgeChecks.js";
import { checkSaveBuild } from "../checks/worldmap/saveChecks.js";

const log = createLogger("API:Debug");
const router = express.Router();

// ─── World Map Diagnostics ───────────────────────────────────────────
// Dedicated checks for everything the World Map page depends on:
// tile CDNs (b42map.com / map.projectzomboid.com), PanelBridge handlers
// for live player/vehicle/safehouse data, save folder layout (B41 vs B42),
// and the local /api/map proxy itself.
router.get("/worldmap", async (req, res) => {
  const t0 = Date.now();
  const checks = [];

  try {
    // Gather context with the same hard timeout we use for /diagnostics.
    const [activeServer] = await Promise.all([
      withTimeout(
        getActiveServer().catch(() => null),
        FS_TIMEOUT_MS,
        null,
      ),
    ]);

    if (!activeServer) {
      checks.push(
        diagWarn(
          "worldmap.activeServer",
          "No active server",
          "No server is currently active in the panel. The map will load tiles but cannot show players, vehicles, or safehouses.",
          {
            category: "worldmap",
            hint: "Servers → select one and click “Set active”.",
          },
        ),
      );
    }

    const { b42Probe, b41Probe } = await checkTileSources(checks);
    const { bridgeStatus, modConnected, statusAge } =
      checkBridgeLiveData(checks);
    const { saveBuild, saveName, savePath, savesDir, saveCount } =
      await checkSaveBuild(checks, activeServer);

    // ─── Map proxy (local) ────────────────────────────────────────────
    // The /api/map/tiles route is mounted unconditionally in index.js. Its
    // upstream URLs are already surfaced in the response payload, so we
    // skip pushing an info-only check here to keep the summary actionable.

    // ─── Aggregate ────────────────────────────────────────────────────
    const summary = { ok: 0, warn: 0, fail: 0, info: 0, skip: 0 };
    for (const c of checks) summary[c.status] = (summary[c.status] || 0) + 1;
    const overall =
      summary.fail > 0 ? "fail" : summary.warn > 0 ? "warn" : "ok";

    res.json({
      timestamp: new Date().toISOString(),
      overall,
      summary,
      checks,
      durationMs: Date.now() - t0,
      // Extra structured data the UI surfaces in dedicated panels.
      tileSources: {
        b42: b42Probe,
        b41: b41Probe,
      },
      bridge: bridgeStatus
        ? {
            configured: bridgeStatus.configured,
            isRunning: bridgeStatus.isRunning,
            modConnected,
            statusAgeMs: statusAge,
            bridgePath: bridgeStatus.bridgePath,
            consecutiveFailures: bridgeStatus.consecutiveFailures,
          }
        : null,
      handlers: WORLDMAP_HANDLERS,
      save: {
        zomboidDataPath: activeServer?.zomboidDataPath || null,
        savesDir,
        activeSaveName: saveName,
        activeSavePath: savePath,
        saveCount,
        build: saveBuild,
      },
      activeServer: activeServer
        ? {
            id: activeServer.id,
            name: activeServer.name || activeServer.serverName,
            serverName: activeServer.serverName,
          }
        : null,
      proxy: {
        b42: "/api/map/tiles/:level/:tile?floor=N",
        b41: "/api/map/b41tiles/:level/:tile",
      },
    });
  } catch (error) {
    log.error(`World map diagnostics failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
